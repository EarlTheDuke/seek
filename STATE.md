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

Last updated: 2026-08-06, by the run that built the detour instrument, killed
three theories with it including two of its own, and found the real bug.

**THE HUNTCHECK TAIL IS ONE BUG AND IT IS NAMED NOW.** Sixteen runs on a quiet
box, ten green and six red. The fix is planned but NOT built — it is queue item
1 and the plan is written there. Everything landed this run is instrument.

## THE DETOUR HAS NO COMMITMENT — the measured bug

`clearSpotNear` is re-solved FROM SCRATCH every tick. A twenty-metre sideways
probe over rolling ground is exquisitely sensitive to the exact origin it is
cast from, so as the body takes its first 6 cm step the answer flickers — and
**13% of ground ticks come back null**, which is plenty to kill an episode a
tenth of a second into a walk that would take eight seconds. Five consecutive
episodes from one red run, deer at 23-26 m, obstruction 6-7 m out:

```
  20 m aside, walked 0 m in 0.1 s  (ground)  ground in the way 6 m out
  20 m aside, walked 0 m in 0.2 s  (ground)  ground in the way 6 m out
  20 m aside, walked 0 m in 0.1 s  (ground)  ground in the way 6 m out
```

**Sixteen detours, twenty metres walked in TOTAL, one metre each, not one ever
completed.** The body picks a knoll, takes one step toward it, forgets, and
refuses the shot again. A person picks the knoll and goes to it.

## Three theories died this run. Two of them were mine.

Every one was measured, not argued. Print the number before you act on any of
these — that is now five queue items closed by disproof across two runs.

| theory | what the instrument said |
|---|---|
| the detour walks sideways FOR EVER / orbits | walks **0-7 m**, 0-2 sign flips. No orbit, no livelock |
| `clearSpotNear` finds nowhere to go | finds a spot **87% on ground, 100% on timber** |
| ground in the way throttles the shot rate | blocked sightlines are **~10 s of a 150 s run** |
| it thrashes between deer (`resolve` picks NEAREST) | **0-5 swaps/run**, longest unbroken stalk **46-86 s** |
| it abandons the animal it wounded | stayed on it **65 of the 72 s after the arrow** — and still could not finish it |
| the lead is over-projecting (3 of 3 arrows LEFT) | `aimed 0.2 m ahead of the animal`. Velocity is already clamped at 14 m/s |

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

## The instruments built this run — all in huntcheck's output

- **detour episodes** (`openDetour`/`walkDetour`/`endDetour`): one obstruction,
  one decision, one named outcome, with ground WALKED against NET displacement
  and sign-flips. Prints its own arithmetic (`closed + open = opened`) and says
  so out loud if the books do not balance.
- **`detourAsked`/`detourNone`** per TICK with the blocker named — built
  precisely because the transition-count inference above was wrong.
- **the wound event now carries `i: creature.id`.** The comment above it has
  said for months it is "the only signal that says keep after THAT one" while
  naming a species, on a hillside holding 18-26 deer. Nothing acts on it yet.
- **`leadBy`/`dropTo`** carry the aim's INPUTS into the miss table, so a wrong
  answer can be read against what it was asked.

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
**2. HUNT** `huntcheck` kills in 61-72 s when it kills, on one arrow. The tail
is understood at last — see the top of this file. **DO NOT TUNE CONSTANTS**:
three passes of that moved the failure around, and this run found the mechanism
only by measuring episodes instead of aggregates.
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
`STOCK=venison:2`, `HUNGER=52`.

## Checks

`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · `campcheck` 36 ·
`boardcheck` 35 · `weathercheck` 27 · `providercheck` 25 · `netcheck` 24 ·
`personacheck` 21 · `mindcheck`/`clockcheck` 21 · `warmthcheck` 20 ·
`deathcheck` 19 · `bookcheck`/`reportcheck`/`raidcheck` 18 · `timbercheck` 17 ·
`agentcheck` 17 · `ordercheck` 17 · `dangercheck`/`herdcheck`/`rendercheck` 12 ·
`survivalcheck` 12 · `bitecheck` 10 · `spreadcheck` 10 · `watchcheck` 10 ·
`refillcheck` 9 · `scarcecheck` 9 · `shotcheck` 8 · `huntcheck` 7 ·
`arrowcheck`/`woundcheck` 7 · `ballisticscheck` 7 · `rostercheck` 6.

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
- `huntcheck` — **ten green, six red in sixteen runs** on a genuinely quiet box
  this time. That is a better rate than the documented six-red-of-seven and it
  is NOT a fix: nothing behavioural changed this run. The box being quiet is the
  most likely difference, and it is a reminder that this check is real-time on a
  wall clock. **The rate is not the finding; the mechanism at the top is.**

## The queue, ranked

1. **COMMIT TO THE DETOUR.** The measured bug — see the top of this file. Once
   `clearSpotNear` names a spot, KEEP it: remember it in world coordinates and
   walk to it until you arrive, it stops being clear, the quarry moves
   materially, or a few seconds pass. Today it is re-decided thirty times a
   second and a 13% flicker rate means it never completes a single walk.

   **PLAN.** Hold `this._detourTo = {x, z, quarryId, at}` on the body. While it
   exists and the quarry is unchanged, walk to it WITHOUT re-solving; drop it on
   arrival (within ~2 m), on quarry change, after a timeout, or if the line
   clears. Re-solve only when there is no held spot. **Flag-gate it** and keep
   the default byte-identical — house style, and this check is noisy enough that
   an unguarded behaviour change cannot be told from luck.

   **HOW IT WILL BE PROVEN.** The instrument is already built and these are the
   numbers to move: detours attempted, metres WALKED per detour (1 m today), and
   the share ending in a shot (3 of 16 today, all of which walked 0-2 m and were
   the line clearing on its own). A working commitment shows metres-walked
   climbing toward the 6-20 m it actually asked for and episodes ending in
   `a shot came on` after a REAL walk. Run it with the flag off and on, several
   times each — **six of sixteen red means a single run proves nothing.**

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
