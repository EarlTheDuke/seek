# State of play — read this first, it is short on purpose

**Last updated: 2026-08-10**, by a session that came back cold, misread this file,
and rewrote it because of that.

**HOW TO READ IT.** Everything down to "Things that will waste your time" is the
current state and the next thing to do. Below that is a standing TRAP LIST rather
than news, and it is the most expensive knowledge in the repo: every entry cost
somebody a wrong diagnosis. **Skim it before you debug anything, not after.**

> **WHY THIS FILE WAS REWRITTEN.** It had reached 892 lines — the file whose own
> header says "short on purpose" and asks for ~100. A cold reader (me) opened it,
> saw `Last updated: 2026-08-07` at the top, cross-checked a git log whose most
> recent 120 commits were all cron noise, and concluded the project had been dead
> for three days. It had not: 35 commits landed on the 9th. **A stale handover is
> worse than none, because it is believed.** Everything cut is in
> `STATE-ARCHIVE-2026-08-10.md`. Cut the closed sections; do not let this grow back.

## WHERE IT IS ALL GOING

**[TRAJECTORY.md](TRAJECTORY.md)** is the programme-level plan — the six arcs,
their order, and the decisions that are not up for re-litigation. VISION.md says
what the world IS; TRAJECTORY says what the WORK is. Read it at any point where
you are choosing what to build rather than how.

## WHERE THE GAME IS

The fleet runs. Six models have played against a human for two hours
(`PLAYTEST-2026-08-07.md`). Start it with the three files in **[RUNNING.md](RUNNING.md)**
— `keys.cmd`, `PLAY.cmd`, `STOP.cmd`. **[TODO.md](TODO.md)** is the tiered backlog;
**[NEXT-BUILD.md](NEXT-BUILD.md)** is the record of predicted-versus-found and is
worth reading for that alone.

Tiers 1, 2a and 2.5 are done. Open: 2b/2c, 2.75 (gold is a FORK, not a bug),
3 (the troll is unmeetable), 4 (the world runs down), 5 (instruments).

## THE ONE NUMBER, AND IT HAS NOT MOVED

Across two six-model runs, ~400 decisions: **five paid models loosed ZERO arrows
and five of seven ended below the eat threshold, while the seat with no mind at
all was fed and comfortable.** Written 2026-08-07. Nothing since has shown it
fixed. The minds talk, coordinate, lie and reason about ambushes — and they
cannot feed themselves. Everything else on the list is a feature; this is the
game not working.

## THE SUITE: 61 checks, 60 green

Full sweep 2026-08-10. `huntcheck` **6/7** is the only real partial — an agent
still does not reliably kill a deer.

Four checks reported nothing in the batch and **all four are fine**:

- `netcheck` 24/24 and `agentcheck` 17/17 **pass when run alone.** They collided
  in the batch. This is the last entry in the trap list, hit again.
- `refillcheck` passes; it prints no `N/M` summary line, so a grep for one misses it.
- `keycheck` is **not a test, it is a pre-flight.** It currently says *"6 seats
  will not think tonight"* — the keys are not in `keys.cmd`. The game still runs;
  those seats fall back to scripted. **Run it before any paid evening.**

And note **a failing check exits 0**, so a red suite looks green to anything that
reads exit codes. Parse the output, not the status.

## THE OPEN BUG, DIAGNOSED AND NOT FIXED

Last real commit, 2026-08-09 22:37: **`gather` cannot take the noun its prompt
promises.**

- `goals.js` declares `gather` with `params: []`, so `sanitiseGoal` strips `item`
  from every model reply, silently.
- `providers.js:278` tells all six models that `gather venison` walks them to a carcass.
- `agent.js` reads `g.item` — a field no mind can set.
- **`lootcheck` is green over a path no real caller can reach**: it builds the goal
  by hand and never imports `sanitiseGoal`.

Measured over eight logs: `gather` is the most-issued goal in the project (281x).
Of 972 gather deeds ever, **866 wood and 15 venison**. The minds reach for meat
constantly and the verb cannot accept the noun. Eighth instance of the model
looking worse than the instrument. Fix items are A254-A257 in `IDEAS.md`.

## THE CRONS — READ THIS BEFORE TRUSTING ANY BACKLOG

- **`highlands-triage` (the BUILDER) was disabled and did not fire for ~92 hours.**
- **`highlands-evaluate` (the OBSERVER) fired ~165 times in that window** and
  produced 36 commits and ~3,465 lines with **zero lines of code**. The live board
  died around 06:00 on the 10th and it went on writing passes about a dead board
  for sixteen hours, asking thirteen times for a toggle it cannot throw itself.
- **Disabled `highlands-evaluate` on 2026-08-10.** An observer with nothing to
  observe is pure cost, and a write-only backlog is not progress.
- **One writer at a time.** Two crons — or a cron and a person — editing this tree
  at once corrupts both. Pause the builder before a human plays: it edits source,
  and a dev-server reload dumps a player to the title screen.

## CONFIRMED WORKING, 2026-08-10

- **A bow you can see on other players.** Slung across the back, drawn into the
  hands. `bowcheck` 11/11, and verified by eye through watch mode —
  `shots/bow-eachann.jpg`. (`runs/bow-on-the-back.png` does NOT show the feature;
  the real evidence is `shots/bow-1-rest.jpg` and `shots/bow-2-drawn.jpg`.)
- **The watch board.** `?watch=1` — the camera flies, the body does not move,
  because a watcher sends no intents and takes no corrections. Free-fly (Y) moves
  your BODY and is useless in multiplayer; past `NET.driftSnap` you are yanked
  back. Use watch mode to look at anything, including your own players.

## NEXT, RANKED

1. **Fix `gather`'s noun** (above). Small, and it unblocks the one number.
2. **Make `lootcheck` pipe through `sanitiseGoal`** — and audit the other checks
   for the same shape. A green check over an unreachable path is a lie.
3. **`huntcheck` 6/7** — instrument predicted-versus-actual impact rather than
   tuning constants. Three tuning passes moved the failure around without fixing it.
4. Re-enable `highlands-triage` once a human is not playing.

## The trap this project falls into

**A name used and never defined** — invisible to build, only found by running the
line. Grep every identifier your new code uses. **And a clean build proves
nothing**: one run's build was green while `gather` had never once put a branch
in a pack. Verify by driving the game, and make the check assert an OUTCOME.

## Things that will waste your time if you do not know them

- **A CHECK'S PRECONDITION CAN BE THE BUG, AND IT LOOKS EXACTLY LIKE A PRODUCT
  DEFECT.** solidcheck's first run reported a push-out failure on 2 of 24 trees
  with a 0.96 m intrusion. The push-out was fine. Its site scan had picked two
  trees whose whole TRUNK sits below the ground a body walks on, because trees
  are planted at `latticeHeight` and bodies walk on `heightAt` and the two
  disagree by up to 4.8 m in the tail. **Before believing a failure, check that
  the thing you set up could ever have passed.** Three of this project's wrong
  diagnoses are now this shape.
- **AIMING ONCE AND WALKING IN A STRAIGHT LINE MEASURES THE CHECK, NOT THE
  GAME.** solidcheck read 8/12 on "can a body cross a wood" and it was the
  check: it set the yaw at the start, so a body nudged three metres sideways by
  a trunk then marched off at a tangent for forty seconds. A real body re-solves
  its heading every tick. Re-aiming, it is 12/12 with a longest jam of 0.6 s.
  **A test body that behaves less adaptively than the real one manufactures
  failures the game does not have.**
- **A SPHERE'S WIDTH DEPENDS ON THE HEIGHT YOU MEET IT AT.** A boulder assertion
  computed the slice at the ground under the ROCK while the body met it standing
  a metre away on a slope — one boulder in ten failed on the difference. Read
  the geometry at the feet the body actually had at the moment of contact.
- **AN INSTRUMENT CAN BE BLIND IN EXACTLY THE CASE THAT MATTERS, AND SAY
  "UNPROVEN" INSTEAD OF "WRONG".** The reach sentinel counted arrows out of
  `agent.shots` — which is pushed only by `howItMissed`, off a `miss` event, so
  it holds the MISSES and nothing else. A `wound` sets `lastShot = null`. So it
  could see the treatment only when the treatment FAILED, and printed *"0 of 0
  arrows, so this run says nothing about the arm"* on a run that loosed an arrow
  and drew blood with it. **A sentinel that fails toward "no evidence" is worse
  than one that fails loudly, because nobody re-runs it.** Cross-check every
  instrument against a counter from a DIFFERENT code path — `agent.arrows` sat
  four lines away on the same page reading 1.
- **A CHECK THAT STOPS ON SUCCESS HAS A DIFFERENT DENOMINATOR PER ARM.**
  huntcheck ends on a kill, so a run that kills is 36-77 s and a run that does
  not is 150. Comparing raw tallies across arms **rewards the arm that fails**,
  for taking longer to fail: this run's control read 14.3 refusals against 43.5
  and per second was 11.6 against 34.8. Divide by the run's own length. Third
  time this project has been bitten by two counts with different denominators.
- **A STRING FROM `.toFixed()` IS TRUTHY, SO `x || fallback` NEVER FIRES.**
  `secs` is `"0"` on a sub-second run — truthy — and the guard sails past it
  into a divide by zero. Coerce before you guard.
- **A `broken`/`failed` FILTER MATCHED AGAINST PROSE MATCHES THE PROSE.** A
  grep for "this instrument is wrong" flagged all 8 runs of the A/B as broken,
  because that exact phrase is in the ORDINARY `too far` breakdown as a
  self-indictment clause. Match the alarm line, not a phrase inside it. Fourth
  false reading in this project from a loose string filter.
- **A FLAG THAT SAYS WORK HAPPENED IS NOT THE WORK, and `?.` HOLDS THE DOOR
  OPEN.** `colliders.add?.()` — no such method, ever — silently did nothing for
  months while `s.collided = true` on the NEXT line announced success, and
  campcheck asserted that flag. Assert the artefact: the cylinder, in the field,
  tagged, at the radius asked for.
- **MEASURE WORLD TRANSFORMS, NOT LOCAL ONES.** A child being crushed by its
  parent reports its own `scale.y` as exactly 1.0. Reading the local number
  proves a bug absent while you are looking straight at it.
- **COMMIT BEFORE YOU MUTATE FOR A COUNTERFACTUAL.** `git checkout -- <file>`
  on a tracked file with UNCOMMITTED work throws the work away too, not just the
  probe. Cost the crouch fix once this run; it had to be retyped.
- **A DEFAULT YOU DID NOT SET IS A DEFAULT THAT CAN CHANGE UNDER YOU.** Claude
  Opus 5 runs adaptive thinking when the `thinking` field is absent; Opus 4.8 ran
  none. The same request body meant opposite things on two models one version
  apart, and the symptom was every call silently returning the scripted brain
  while the header named the model. **State the posture on every request.**
- **`content[0]` IS NOT THE ANSWER.** With thinking on, block zero is a THINKING
  block and `.text` is `undefined`. Filter for `type === 'text'` and join. This
  cost the entire LLM integration and raised no error anywhere.
- **A FIXTURE MISSING A FIELD THE REAL API ALWAYS SENDS PASSES FOR THE WRONG
  REASON.** mindcheck's payloads had no `type` on their content blocks, so its
  "a rubbish reply falls back" assertion was green because the field was ABSENT,
  not because the reply was rubbish.
- **AN `export` INSIDE `boardHtml()`'s TEMPLATE LITERAL IS NOT AN EXPORT** — it
  is page text, and `export` in a plain `<script>` is a syntax error that breaks
  the entire board while every check stays green. Same trap as the `//` comment
  in that string, new clothes. The card is browser-side; assert it from source.
- **`new URL(...).pathname` PERCENT-ENCODES THE SPACES** in this repo's own path
  and node cannot open the result. Use `fileURLToPath`.
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
