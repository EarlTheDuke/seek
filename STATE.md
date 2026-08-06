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

Last updated: 2026-08-06, by the run that made the step aside CLOSE — and then
found that the thing it was aimed at was never a bug at all.

**QUEUE ITEM 1 IS BUILT, MEASURED AND GREEN — and the headline is the second
finding, not the first.** A step aside now closes the range, and for the first
time in this project's record a detour produced a shot BY WALKING. But `too far`,
the outcome the whole thing was aimed at, turns out to be the body behaving
CORRECTLY. Do not build the queue's old fallback for it. See below.

## WHAT SHIPPED: `DETOUR=close` — a step aside that closes the range

`clearSpotNear` offered candidates ONLY perpendicular to the line of sight, so a
step aside held the range exactly — worse, a 6 m step at 24 m LENGTHENS the slant
to 24.7. A candidate may now also move UP the line of sight: `along =
min(AGENTS.detourAdvance * |step|, d − AGENTS.standOff)`, clamped so a sidestep
cannot do what closing is forbidden to do. The flats are still tried AFTER the
diagonals, so the candidate set is a strict SUPERSET and `nowhere to go` can
only fall.

**Why it should work, in one line:** distance to a point is convex along a
straight line, so the greatest range over a walk is at one of its ends. A spot
nearer than where the body stands means the slant never exceeds where it already
was.

Flag-gated `DETOUR=close`, composable: `DETOUR=commit,close`. **Default OFF and
byte-identical** — `advance: 0` is the old six candidates in the old order, and
detourcheck asserts that spot for spot as well as tick for tick.

## IT WORKS — and this is the number that matters

Pooled over 4 huntcheck runs an arm, alternating, `commit` against `commit,close`:

| | commit | commit,close |
|---|---|---|
| closed detour episodes | 7 | 14 |
| **ended with a shot** | **1 (14%)** | **4 (29%)** |
| **…and those walked** | **0 m** | **3, 3, 3, 7 m** |
| `too far` share | 4 (57%) | 5 (36%) |
| range closed (M < N) | 3/7 (43%) | 10/14 (71%) |
| stepped up the line | 0/7 | 14/14 |
| m walked per detour | 1 | 2 |
| deer killed | 4/4 | 3/4 |

**READ THE SECOND AND THIRD ROWS TOGETHER.** The control's one "success" walked
**0 m** — which the instrument itself flags as the line clearing on its own, not
the step. All four of the closing arm's successes walked 3-7 m and one recorded
`arrived`. **That is the first evidence in this project that a step aside
produces a shot BY STEPPING.** Every previous green was the geometry resolving
itself while a detour happened to be open.

The control lines read `24 m -> 24 m` and `27 m -> 27 m` — the range preserved
to the metre, which is the geometric claim confirmed in the field.

**Metres walked per detour did NOT climb to the 6-20 m the queue predicted.**
Still 2 m, because 8 of 10 episodes still end inside 0.7 s. Kills went 4/4 to
3/4, which is noise: huntcheck is red about a third of the time, and the one
closing failure was a run with 10 detours — a harder scenario, not the same one
failing. **The arms did not face identical worlds**; real-time jitter changes the
trajectory, and run 1 of each arm diverged completely (0 detours vs 10).

## AND THE THING IT WAS AIMED AT WAS NEVER A BUG

`too far` ended detours with the deer at **20-23 m against a 26 m `shootRange`**,
which is impossible on horizontal range alone. Two mechanisms could do it and
they want OPPOSITE fixes, so `aimAt` now hands back `slant`, `dy` and `leadBy`
with the refusal and huntcheck prints them one per line.

**Measured immediately, and it is not close: 9 of 9 are THE CLIMB.**

```
  deer  23 m away, arrow must fly    26 m  (+12.6 m of climb,  0.1 m of lead)
  deer  45 m away, arrow must fly  56.6 m  (+17.9 m of climb,  8.7 m of lead)
  deer  21 m away, arrow must fly    27 m  ( -8.4 m of climb,  4.7 m of lead)
```

`shootRange` is a SLANT limit because the range that matters is the one the arrow
flies. So a 27 m shot under a 26 m rule is **honestly refused**, and `too far`
ending a step aside is the body deferring the sidestep until the animal is in
range and closing instead — which is what it should do.

> **DO NOT BUILD the queue's old option (b)** ("do not let `too far` end a
> committed detour"). It would force the body to walk to a firing position for a
> shot it cannot take. The old queue text called it "cheaper still"; it is wrong,
> and it is only knowable from the three numbers above.

Note the lead hypothesis was the *plausible* one — a deer at 14 m/s earns ~6 m of
lead at that flight time — and it was wrong. Printing beat arguing again.

## The instruments, cumulative

- **`slant`/`dy`/`leadBy` on a `too far` refusal**, printed one line per refusal
  and never averaged, with a self-indictment: a refusal whose slant is UNDER
  `shootRange` means the instrument is wrong, and it says so.
- **`along` on every detour episode**, and huntcheck refuses to be read quietly:
  it prints "CLOSING IS ON AND NOT ONE DID: distrust this run" and the converse.
  **This is the arm sentinel** — it proves which code was loaded from the DATA
  rather than from the env var, and this project has twice believed an A/B that
  was running the same arm twice. It read 0/7 and 14/14. The arms were real.
- **the `too far` share and the range-closed count printed as NUMBERS**, not left
  derivable. The last finding sat unread in this block for a run and a half
  because it was derivable and nobody derived it.
- **detour episodes** (`openDetour`/`walkDetour`/`endDetour`): one obstruction,
  one decision, one named outcome, ground WALKED against NET displacement and
  sign-flips. Prints its own arithmetic and says so if the books do not balance.
- **`resolves`/`held`/`dropped`** per episode, **`detourAsked`/`detourNone`** per
  TICK with the blocker named, the wound event's `i: creature.id`, and
  `leadBy`/`dropTo` in the miss table.

## `detourcheck` — 18/18, no port, no server, no wall clock

**The one check here that is not real-time, on purpose**, and the only one you
can run on a busy box and believe. It drives the real `Agent.prototype` over real
terrain at **24 sites found by scanning**, not pasted in as coordinates.

It reproduces the bug with the deer **STANDING STILL**: on the default arm the
step aside walks the body from 22 m out to **25.5 m** — into the 26 m ceiling —
on 23 of 24 sites. Closing ends those same walks at **15.1 m** and opens the
range on 2. Six new assertions cover the spot being nearer, the stand-off floor,
the superset property, the range never rising over the walk, and `advance: 0`
being the old candidate set spot for spot.

**The counterfactual: 18/18 -> 15/18** with the diagonals disabled in the real
code, and exactly the three mechanism assertions fell. It also put a number on
the original claim — with diagonals off a step aside LENGTHENS the range by a
mean 3.1 m. (Commit first, mutate, run, `git checkout --`, then grep to prove the
probe is gone AND the real code is back.)

## Theories that died, and one of them was mine this run

Every one measured, not argued. Print the number before you act on any of these.

| theory | what the instrument said |
|---|---|
| **`too far` is a bug to be fixed** | **it is the CLIMB, 9 of 9, and the refusal is correct** |
| **the lead is what puts a 20 m deer out of a 26 m bow** | lead is under 1 m in 6 of 9; climb is 6-18 m |
| **closing will move the kill rate** | 4/4 -> 3/4. It moved the DETOUR outcomes, not the kills |
| committing to the detour will move the kill rate | 4/8 both arms — fixed its flicker, changed nothing downstream |
| the flicker is what stops the walk completing | it stops 13-17% of TICKS; `too far` stops 50-57% of EPISODES |
| the detour walks sideways FOR EVER / orbits | 0-7 m, 0-2 sign flips. No orbit, no livelock |
| `clearSpotNear` finds nowhere to go | 87% on ground, 100% on timber (35% null on one later run) |
| ground in the way throttles the shot rate | blocked sightlines are ~10 s of a 150 s run |
| it thrashes between deer (`resolve` picks NEAREST) | 0-5 swaps/run, longest unbroken stalk 46-86 s |
| it abandons the animal it wounded | stayed on it 65 of the 72 s after the arrow |
| the lead is over-projecting (3 of 3 arrows LEFT) | `aimed 0.2 m ahead`. Velocity is already clamped at 14 m/s |

## What separates a green run from a red one

**Every green run put ONE arrow into ONE deer and ate** — kill in 53-72 s, one
animal. **Every red run's arrows went HOME** — `vsModel` 0.0-0.5 m, the aim is
not the problem — and banked one or two wounds without a kill.

**Shot RATE is still the whole tail.** The body is inside `AGENTS.shootRange` for
**5-14% of a run**, and nothing this run or last run changed that.

## CLOSED EARLIER, kept to three lines each

**The bow is understood** (`ballisticscheck` 7/7, port 8088): median **0.17 m**
from its own model out to 151 m, and the one real bias — `Bow.fire` spawns the
shaft 0.55 m down the aim line while every model launched from the eye — is fixed
as `BOW.muzzle`. The phantom "arrows land long" was geometry.

**A body can say it picked something up** (`Agent.notePack`) and **a craft deed
is no longer a keypress** (`Agent.noteMake`) — `World.update` refuses a craft in
total silence. Both proved red as well as green; `survivalcheck` 12/12.

**The miss table measured the wrong thing** for three sessions: `across` is
against the LEAD-ADJUSTED mark, so it structurally could not see a mis-lead.
`leadAcross`/`leadAlong` put the DEER's own position into the shot-line frame.

## THERE IS A BOARD. `BOARD=on npm run agents` -> http://127.0.0.1:8090

One card per mind, repainting once a second: who it is, what model, which persona
(hover the tag), what it is doing, WHY, how its body is, what is in its pack —
and four threads of which only the first was ever visible, through chat:

  meant · did · went astray · would not shoot

**"would not shoot" is the best line on the page.** Off by default, loopback
only, cannot kill the run hosting it. `boardState` is pure (agents in, JSON out)
so the check builds boards from invented agents too. `boardcheck` **35/35, and it
discriminates — 27/31 with three fields broken.**

## THE LADDER IS DONE. All six rungs green.

**1. SURVIVE** `survivalcheck` 12/12 — forage, light, cook, eat, live the night.
**2. HUNT** `huntcheck` kills in 53-102 s when it kills, on one arrow. **DO NOT
TUNE CONSTANTS**: three passes of that moved the failure around, and every real
mechanism since has been found by measuring EPISODES and their named OUTCOMES.
**3. MINDS & PROVIDERS** `providercheck` 25/25. One OpenAI-compatible provider
plus Anthropic; `MINDS_PROVIDER/BASE_URL/MODEL/API_KEY`, per-agent overrides in a
roster file. Proved against a local fake endpoint — no key needed to test.
**4. PERSONAS** `personacheck` 21/21. `PERSONAS=off|on|hoarder,liar,…`; OFF is
byte-identical and the check asserts the BYTES. **`SCARCE=0.7,0.5` is the gentler
setting if a full roster starves.**
**5. WATCHABLE — both miles.** `NARRATE=on` (`watchcheck` 10/10); `BOARD=on`
(`boardcheck` 35/35).
**6. A FULL ROSTER** `MAX_PLAYERS` 16, measured: 60 Hz tick unmoved at 12 and 16,
56-65 KB/s per client. The TICK is not the ceiling, the WIRE is — everybody is in
everybody's snapshot, so the total grows with the SQUARE of the roster.
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
`STOCK=venison:2`, `HUNGER=52`, `DETOUR=commit,close`.

**`DETOUR=commit,close` is safe for the evening and is now mildly RECOMMENDED**,
which `commit` alone never was. It is the only configuration in which a step
aside has been seen to walk somewhere and produce a shot, and a hunting body
working its way round a knoll toward a deer is worth more on camera than one
sidestepping in place. It did not raise the kill rate; nothing yet has.

## Checks

`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · `campcheck` 36 ·
`boardcheck` 35 · `weathercheck` 27 · `providercheck` 25 · `netcheck` 24 ·
`personacheck` 21 · `mindcheck`/`clockcheck` 21 · `warmthcheck` 20 ·
`deathcheck` 19 · `bookcheck`/`reportcheck`/`raidcheck` 18 · **`detourcheck` 18** ·
`timbercheck` 17 · `agentcheck` 17 · `ordercheck` 17 ·
`dangercheck`/`herdcheck`/`rendercheck` 12 · `survivalcheck` 12 · `bitecheck` 10 ·
`spreadcheck` 10 · `watchcheck` 10 · `refillcheck` 9 · `scarcecheck` 9 ·
`shotcheck` 8 · `huntcheck` 7 · `arrowcheck`/`woundcheck` 7 ·
`ballisticscheck` 7 · `rostercheck` 6.

Ports: **ballisticscheck 8088**, boardcheck 8093 (plus 8090 for its own board and
8089 for the fleet's), rostercheck 8091, watchcheck 8092, scarcecheck 8094,
survivalcheck 8095, huntcheck 8096 (**takes a port argument: `node
server/huntcheck.js 8096`**), refillcheck 8097, herdcheck 8098,
shotcheck/bitecheck 8099. The board's own default is **8090**. `refillcheck` walks
a real body about 1.3 km and takes roughly four minutes. `netcheck` and
`survivalcheck` want a quiet box. **ballisticscheck spends the whole twelve-arrow
quiver and takes about three minutes.**

## Known red, and honestly so

- `netcheck` "it went with her" (a companion trailing a continuously moving
  owner) is the long-known load-sensitive one.
- `huntcheck` — **7 green of 8 across this run's A/B**, four runs an arm, on a box
  that was NOT quiet: five `node.exe` were already running and one of them owns
  8080. They were left alone rather than killed, so read the rate accordingly.
- **The A/B's effective sample is smaller than "4 runs an arm" sounds.** The seed
  is fixed (`makeRandom('huntcheck')`), so runs differ only by real-time jitter:
  `commit` runs 2/3/4 were near-duplicates (all 72 s kills, 2-3 detours) and
  `close` runs 2 and 4 were identical twins. Call it 2-3 distinct scenarios an
  arm. **Vary the seed before trusting any rate from this check.**

## The queue, ranked

1. **THE SHOT RATE, and it is now the only thing left in the hunting tail.** The
   body is inside `AGENTS.shootRange` for **5-14% of a run** and every mechanism
   fixed in the last three runs has left that untouched. Two runs have now ended
   with "the aim is fine, the arrows go home, there are just almost no shots".
   **Do not start another detour fix.** The detour is understood and closed.

   **WHERE TO LOOK FIRST, on this run's evidence:** the refusal instrument says
   the commonest reason a shot is not on is the CLIMB — 9 of 9 `too far` refusals
   were a deer 6-18 m above or below the eye. `shootRange` is 26 m of SLANT, so a
   deer 12.6 m up is unshootable past 22.7 m of ground distance and the body has
   exactly one lever, which is walking closer. **Ask whether 26 m of slant is the
   right rule at all** — `ballisticscheck` says the bow is understood to 0.17 m
   out to 151 m, so the limit is a judgement about hit probability, not physics,
   and it was tuned down from 45 for a reason that is written in `config.js`.
   Measure the hit rate by slant band before changing it. **A constant tuned
   without that measurement is the fourth pass of exactly what this project has
   been told three times not to do.**

2. **`p.lastCraft`** (world.js:911) is written on every successful craft and read
   by nothing — a confirmed-make signal already on the server, if anyone wants it
   on the wire rather than inferred from the pack.
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` while integrating
   flight in `(+sin, +cos)`. **Half answered: a BODY walks along `(−sin yaw, −cos
   yaw)`, measured on the server four ways.** Whether `wind.angle` means "blowing
   toward" or "coming from" is still unestablished, and that is the half that
   decides the sign.
4. **Arrows fired at ~0 m all miss.** Unexamined since the aim fix.
5. **Nothing comes back DOWN about your own animal** — hurt, fed, killed.
6. **Crouch is a uniform Y squash of the whole avatar.**
7. **An arrow that outlives `ARROW.maxFlightTime` is spliced out with NO
   `onMiss`** (projectiles.js:205). Nothing observed it, but a mind that shoots
   into the sky would never learn that it did.
8. **A shot solved at 3.04° pitch for a deer 19.9 m away**, our own model saying
   it would come down at 93.4 m, and it hit a tree 37.8 m from there. Seen ONCE,
   on a steep downhill shot. Not chased because one arrow is not a finding — but
   if `dropTo` shows up large on the next few, it is `solvePitch` on steep ground.
   **This run's climb finding makes it likelier**: steep ground is everywhere.
9. **The 68 → 37 creature drift — measured, and BENIGN.** It tracks how spread out
   people are, not a leak. Only reopen if a hillside goes quiet in play.

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

## Things that will waste your time if you do not know them

- **BUILD AN ARM SENTINEL INTO THE OUTPUT — a number that is 0 on one arm and N
  on the other BY CONSTRUCTION.** huntcheck prints "`along` was 0 of 7" on the
  control and "14 of 14" on the treatment, and says *"CLOSING IS ON AND NOT ONE
  DID: distrust this run"* when they disagree. It proves which code was loaded
  from the DATA, not from the env var you believe you exported. Two A/Bs in this
  project have run the same arm twice; this costs three lines and ends it.
- **huntcheck's SEED IS FIXED (`makeRandom('huntcheck')`), so four runs are not
  four samples.** Runs differ only by real-time jitter, and in this run's A/B
  three of four control runs were near-duplicates (all 72 s kills) and two of the
  treatment runs were identical twins. The effective sample was 2-3 scenarios an
  arm, not 4. **Vary the seed before quoting any rate off this check.**
- **A REFUSAL CAN BE CORRECT.** `too far` ended the majority of every step aside
  and was written up as the bug to fix; it is a deer 6-18 m above the eye and a
  `shootRange` that is a SLANT limit, so the shot genuinely was not there. A
  whole queue item was aimed at forcing the body to ignore it. **Before fixing
  the commonest failure, check it is a failure.**
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
