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

Last updated: 2026-08-06, by the run that instrumented the hillside, found a deed
that was a keypress, and caught the miss table lying for the third time.

**Two queue items were closed by DISPROVING them this run.** Items 1 and 2 both
described bugs that do not exist — a huntcheck run that finds no deer, and a
craft deed written every tick. Both premises were reasoned from where a call
sat, never measured. Both had a real and different defect underneath. If you are
about to act on a queue entry here, print the number first.

## A CRAFT DEED WAS A KEYPRESS — and the bug in the queue did not exist

`did('craft', …)` fired the instant `i.craft` was set — an INTENT wearing an
outcome's clothes, the same mistake `arriveWithin` (6 m) vs `PICKUP.radius`
(2.2 m) made one method down. **What that hid: `World.update` refuses a craft in
TOTAL SILENCE** — no station within `SURVIVAL.fireReach`, inputs gone, or
`maxHeld` met, and nothing is said to anybody. A body at a cold fire pressing all
night filled its deed log and its session report with meals it never cooked.

The deed now comes off the recipe's own `outputs` ARRIVING in the pack, inside
the window the make already owns (`Agent.noteMake`), and `acted.craftTried` sits
beside `acted.craft` the way the report already separates reaches from items.
`survivalcheck` **12/12**, and it DISCRIMINATES: with the old press-time line put
back it goes **11/12**, red on exactly that check.

**But queue item 2's premise was FALSE.** It said "a craft writes a deed every
tick"; it does not. `survivalcheck` stages `STOCK=venison:2`, so the two lines at
1.27h were **two real steaks** — `craftTried: 2 / craft: 2` says so directly. The
per-tick spam was reasoned from where the call sat and never measured. One
`console.log` of the tally would have settled it in ten seconds.

## THE HILLSIDE IS NEVER EMPTY. Queue item 1's premise was false too.

`npm run huntcheck` now samples the herd once a second and prints, on any run
that killed nothing, **which of six failures it actually was** instead of leaving
it to be inferred from three tables that all read "nothing happened".

Seven runs, and the answer never varied:

```
  a deer in the snapshot   147/147 samples (100%), 18-26 at a time    <- every run
  a quarry was LOCKED ON   133/147 (90%)
  hunting but NO deer found  3/147
  inside shootRange 26 m    19-41/147 (13-28%)
```

**There is no "run that finds no deer".** The snapshot holds eighteen to
twenty-six of them, always, and `resolve` falls through to `roam()` with a hunt
goal about three seconds in a hundred and fifty. What actually varies is the
**13-28% of seconds in which a deer is inside `AGENTS.shootRange` (26 m)** —
everything else is a body walking.

### the failures are NOT one failure, and the biggest is not marksmanship

**Seven runs today, four red — and the red ones are TWO different bugs, in equal
measure.** Every row below is a real run:

| # | arrows | outcome | `ground in the way` | verdict |
|---|---|---|---|---|
| 4 | **1** in 150 s | 1 wound, 0 kills | **24** (deer 12-23 m) | RED — throttled |
| 5 | **1** in 150 s | 1 wound, 0 kills | **17** (deer 14-25 m) | RED — throttled |
| 1 | 7 | 0 kills, 5 measured misses | 6 | RED — missed |
| 2 | 6 | 0 kills, 5 measured misses | 3 | RED — missed |
| 3 | 1 | kill in 72 s | few | green |
| 6 | 2 | 1 wound + kill in **77 s** | **0** | green |
| — | 3 | 1 wound + kill in 134 s | 10 | green |

**IT TAKES TWO ARROWS TO KILL A DEER.** Every kill this run was a wound
followed by a kill, and every wound left the animal up at 17 hp. So a body
throttled to ONE shot cannot kill one however well it aims — which is exactly
what runs 4 and 5 are. Both of their single arrows HIT.

Read the `ground in the way` column against the verdict. The cleanest run of the
day (run 6: kill in 77 s) had **none**; the two worst had seventeen and
twenty-four. That is a correlation over seven runs, not a proof — runs 1 and 2
are a genuine aiming failure with only 3-6 ground refusals between them, and
they are the ones the new LEAD column exists for.

**The first cut of the verdict line called runs 4 and 5 "marksmanship".** It now
separates the wound case and the never-loosed case and names the dominant
refusal — a verdict that names the wrong bug is worse than no verdict at all,
and this one named the wrong bug on its first outing.

### and the miss table has been measuring the wrong thing all along

Every arrow on every red run: **`vsModel` 0.0-0.3 m, `across` exactly 0.0 m.**
The bow does precisely what it is told, and `across` said so ten times out of
ten. Then why the misses?

**Because `across` is measured against `mark`, and `mark` is the LEAD-ADJUSTED
aim point `aimAt` returns.** Its own doc comment claimed it showed "spread and
mis-lead". It cannot show a mis-lead: a wrong lead moves the ANIMAL off the
mark and never moves the arrow off it. Ten arrows of exactly 0.0 was the tell —
a crouched, stationary body has nearly no spread, so the column was
structurally incapable of reporting the one failure that fits the evidence.
**That is the third time an instrument in this project has lied**, after `hit`
as a boolean and `along` as marksmanship.

So `lastShot` now carries `quarryId`, and `howItMissed` puts the DEER's own
position at impact into the shot-line frame: **`leadAcross`** (the lead error)
and `leadAlong`. huntcheck prints it per arrow and prints the SIGN SPLIT, because
a tolerance on the mean cannot see a bias. The mind is told too — *"the deer was
4 m to the left of my mark when it landed"* is an actionable sentence and *"a
miss, but barely"* is not.

**It works, and it has only been read on a GREEN run so far.** First live
payload, on a miss that every other column called flawless:

```
  25 m  vsModel +0.1 m  across 0 m  (pitch -11.28°, hit ground)
        the deer itself was 0.5 m LEFT of the mark and 3.6 m NEARER than solved for
```

Half a metre of lateral lead error — nothing — and **3.6 m of range error**,
because the deer was closing while the shaft was in the air. `leadAlong` may
turn out to be the interesting half: the pitch is solved for a range the animal
has already left. **No RED run has been measured with it yet.** That is the
first thing to do next: `npm run huntcheck` until one goes red, then read the
LEAD line and its sign split.

### honesty about the rate

**Four red in seven today**, against the documented six-of-seven. **Do not treat
that as a regression** — builds, greps and a `npm run build` were running on the
box during several of them, and this check is real-time on a wall clock. The box
was not quiet. The rate is not the finding; the two failure SHAPES are.

## CLOSED EARLIER, kept to three lines each

**The bow is understood** (`ballisticscheck` 7/7, port 8088): median **0.17 m**
from its own model out to 151 m, and the one real bias in it — `Bow.fire` spawns
the shaft 0.55 m down the aim line while every model launched from the eye — is
fixed as `BOW.muzzle`. The phantom "arrows land long" was geometry; the yardstick
is the first entry in the trap list and it is printed at the end of the check.

**A body can say it picked something up** (`Agent.notePack`): driven off the pack
RISING on the server's snapshot, never off the keypress. Consecutive pickups
coalesce into one growing line; the starting kit is adopted in silence; a fall is
not a deed; a make owns the pack for `AGENTS.makeOwnsPackFor`. Proved red as well
as green — with that window at 0 it announces a steak it cooked as something it
found, and survivalcheck goes red on exactly that line.

## THERE IS A BOARD. `BOARD=on npm run agents` -> http://127.0.0.1:8090

One card per mind, repainting once a second: who it is, what model, which
persona (hover the tag), what it is doing, WHY, how its body is, what is in its
pack — and four threads of which only the first was ever visible, through chat:

  meant · did · went astray · would not shoot

**"would not shoot" is the best line on the page.** A body that stalks for two
minutes and never looses used to be indistinguishable from a broken one.
Off by default, loopback only, cannot kill the run hosting it. `boardState` is
pure (agents in, JSON out) so the check builds boards from invented agents too.
`boardcheck` **35/35, and it discriminates — 27/31 with three fields broken.**

**It has now lied twice and been caught twice** — `hit` read as a boolean when
it is a SURFACE NAME (seven misses shown as "7 hit"), and `along` printed as
marksmanship when it is geometry (above). Both times the fixture had been
written from the same guess as the code and ratified it. Both are pinned by
assertions in boardcheck now. Fixture values come out of REAL payloads.

## THE LADDER IS DONE. All six rungs green.

Detail on how each one was won is in FINDINGS.md; what is still worth knowing:

**1. SURVIVE** `survivalcheck` 12/12 — forage, light, cook, eat, live the night.
**2. HUNT** `huntcheck` kills in 65-134 s when it kills, on one or two arrows.
The tail is NOT an empty hillside (measured, see the top of this file) and it is
not one bug either: half of it is the shot rate and half is the aim. DO NOT TUNE
CONSTANTS ON ONE RUN — three passes of that moved the failure around without
fixing it, and this run found two more instruments that were lying.
**3. MINDS & PROVIDERS** `providercheck` 25/25. One OpenAI-compatible provider
plus Anthropic; `MINDS_PROVIDER/BASE_URL/MODEL/API_KEY`, per-agent overrides in
a roster file. Proved against a local fake endpoint — no key needed to test.
**4. PERSONAS** `personacheck` 21/21. `PERSONAS=off|on|hoarder,liar,…`; OFF is
byte-identical to the old prompt and the check asserts the BYTES. Who was who
lands in the console header, the summary and the report. Scarcity is the half
that makes character mean anything: `SCARCE=on` (or `0.5,0.8`) feeds one
richness field into both firewood and herds. **`SCARCE=0.7,0.5` is the gentler
setting if a full roster starves** — at full strength a spawning player's 18
animals become 4.
**5. WATCHABLE — both miles.** `NARRATE=on` makes each mind say its goal, its
reason and its persona into the chat column (`watchcheck` 10/10); `BOARD=on`
gives a watcher the whole fleet on one page, with the three threads chat never
carried (`boardcheck` 35/35). See above.
**6. A FULL ROSTER** `MAX_PLAYERS` 16 (`MAX_PLAYERS=` to change), measured
rather than assumed with every body hunting: 60 Hz tick unmoved at both 12 and
16, 56-65 KB/s per client. The TICK is not the ceiling, the WIRE is — everybody
is in everybody's snapshot, so the total grows with the SQUARE of the roster.
`node server/rostercheck.js 8091 24` before anybody promises thirty-two.

## For the evening itself

```
DANGER=no-bears SCARCE=on node server/server.js 8080
MINDS_ROSTER=roster.json PERSONAS=on NARRATE=on BOARD=on npm run agents  # keys in the ENVIRONMENT
npx vite --port 5173 --strictPort
```

**Put http://127.0.0.1:8090 on the second monitor** and play in the first. That
is the difference between "some NPCs are wandering" and watching three models
disagree about a carcass — the chat column tells you what, the board tells you
why, and only the board keeps it on screen long enough to read.

The header prints what is ACTUALLY about to play — a line per player, its model,
its character, and `(no XAI_API_KEY)` beside anyone who quietly fell back to
scripted. Read it. Other knobs, all off by default: `HOURS=1`, `RAID=6`,
`STOCK=venison:2`, `HUNGER=52`.

## Checks

`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · `campcheck` 36 ·
**`boardcheck` 35** · `weathercheck` 27 · `providercheck` 25 · `netcheck` 24 · `personacheck` 21 ·
`mindcheck`/`clockcheck` 21 · `warmthcheck` 20 · `deathcheck` 19 ·
`bookcheck`/`reportcheck`/`raidcheck` 18 · `timbercheck` 17 · `agentcheck` 17 ·
`ordercheck` 17 · `dangercheck`/`herdcheck`/`rendercheck` 12 · `bitecheck` 10 ·
`spreadcheck` 10 · `watchcheck` 10 · `refillcheck` 9 · `scarcecheck` 9 ·
`shotcheck` 8 · **`survivalcheck` 12** · `huntcheck` 7 · `arrowcheck`/`woundcheck` 7 ·
**`ballisticscheck` 7** · `rostercheck` 6.

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
- `huntcheck` — **three red in five today**, on a box that was NOT quiet (builds
  and greps ran during the first two). Do not compare that with the documented
  six-of-seven and do not read it as a regression. The green ones killed off one
  or two arrows in 72-134 s; the red ones are described at the top of this file
  and they are not all the same failure.

## The queue, ranked

0. ~~ARROWS LAND LONG~~ **CLOSED — it was the instrument.** See the top of this
   file and `ballisticscheck`. The bow is within 0.17 m of its own model out to
   151 m, and the one real bias in there (the 0.55 m muzzle) is fixed. **So the
   huntcheck tail is NOT ballistics** — whatever is left is the aim: the lead,
   the mark, the spread, or the shot never being taken. Item 1 is now the live
   lead, and the refusal log is the instrument for it.
1. ~~The one huntcheck run in seven that finds no deer.~~ **CLOSED — there is no
   such run.** 147/147 samples hold 18-26 deer on every run measured. See the
   top of this file. What it exposed, ranked, is now items 1a and 1b:

   **1a. THE SHOT RATE — `ground in the way` throttles it to one arrow, and one
   arrow never kills.** Two of the four red runs refused **24 and 17** times for
   ground at 12-25 m, got a SINGLE arrow away in 150 s, and HIT with it. The
   cleanest green run had **zero** ground refusals and killed in 77 s.
   `clearSpotNear` exists for exactly this and writes *"stepping N m aside for a
   clear line"* into memory, and **nothing anywhere counts whether the detour is
   attempted or whether it ever clears the line** — the same instrument gap the
   refusal log had before somebody built it. Count detours attempted vs
   refusals cleared FIRST; only then decide between fixing the detour and
   fixing the stand-off.

   **1b. READ THE LEAD COLUMN ON A RED RUN — no red run has been.** Its one
   live reading (on a green run) was 0.5 m of lateral lead error and **3.6 m of
   RANGE error**: the deer was closing while the shaft flew, so the pitch was
   solved for a range it had already left. If that repeats on the red runs,
   `leadAlong` is the bug and not `leadAcross`. Read the SIGN SPLIT — all one
   way is a lead the solver gets wrong, a split is spread. **Do not tune
   `BOW`/`AGENTS` constants before reading it**; three passes of that moved the
   failure around without fixing it.

   **1c. One arrow does not kill a deer** — both throttled runs left one at
   17 hp. Worth knowing before anyone reads "wounded, not killed" as an aim bug.
2. ~~A craft writes a deed EVERY TICK it stands at the fire.~~ **CLOSED, and the
   premise was FALSE** — see the top of this file. The two lines at 1.27h were
   two real steaks (`STOCK=venison:2`), not one press counted twice; the server
   resolves a craft instantly so the branch fires once per make. The defect
   underneath it was real and different: a craft the server refuses in silence
   was recorded as a meal. Fixed via `noteMake`, `survivalcheck` 12/12.
   **Still open from it:** `p.lastCraft` (world.js:911) is written on every
   successful craft and **read by nothing anywhere** — a confirmed-make signal
   already sitting on the server, if anyone wants it on the wire rather than
   inferred from the pack.
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` while integrating
   flight in `(+sin, +cos)`. **Half answered: a BODY walks along `(−sin yaw,
   −cos yaw)`, measured on the server four ways.** So `(−sin, −cos)` is this
   project's forward and the glider's integration is the odd one out — but
   whether `wind.angle` means "blowing toward" or "coming from" is still
   unestablished, and that is the half that decides the sign.
4. **Arrows fired at ~0 m all miss.** Unexamined since the aim fix.
5. **Nothing comes back DOWN about your own animal** — hurt, fed, killed.
6. **Crouch is a uniform Y squash of the whole avatar.**
7. **The 68 → 37 creature drift — measured, and BENIGN.** It is not a leak, it
   tracks how spread out people are: four bodies on one shore have almost
   entirely overlapping 320 m circles and draw one valley's worth between them.
   **11–19 animals within 320 m of EVERY body, all run.** Only worth reopening
   if somebody sees a hillside go quiet in play.
8. **An arrow that outlives `ARROW.maxFlightTime` is spliced out with NO
   `onMiss`** (projectiles.js:205). Nothing observed it — ballisticscheck waits
   past 12 s so a silence there is real — but a mind that shoots into the sky
   would never learn that it did.

## Things that will waste your time if you do not know them

- **A GROUND IMPACT IS NOT A MISS DISTANCE.** The mark is a chest 0.75 m up; the
  shaft lands on the dirt. At a two-degree descent that is **ten to fourteen
  metres of overshoot built into every honest shot**, and it SHRINKS with range
  as the descent steepens. Measuring the impact against the animal and reading
  the sign cost this project a phantom bug at the top of the queue for a
  session. Read `vsModel`. The yardstick is printed at the end of
  `ballisticscheck` so nobody has to re-derive it.
- **AN EMPTY QUIVER IS COMPLETELY SILENT.** The starting kit is twelve arrows,
  and `Bow.fire` calls `cancel()` and returns when `consumeAmmo` fails: no
  shaft, no event, no complaint on the wire. Twelve good shots followed by six
  nothings looked exactly like long shots failing to report, and the ranges were
  ordered ascending, which made it look causal. **Count your arrows before you
  believe a range effect.**
- **A TOLERANCE ON THE MEAN CANNOT SEE A BIAS.** ballisticscheck's first verdict
  passed +0.31 m as "no systematic error" while every one of twelve arrows erred
  the SAME WAY. Twelve heads in a row is the finding; the magnitude was never
  the point. Test the SIGN SPLIT.

- **PROVE WHICH ARM IS LOADED BEFORE YOU BELIEVE A NUMBER.** Two ways to think
  you reverted something and not have: `git stash push <file>` AFTER committing
  stashes nothing, and `git checkout -- <file>` on an UNTRACKED file restores
  nothing. Both are silent, both exit 0, and both give you the same code twice
  and a beautifully consistent counterfactual. Always `grep -c` the mutation
  afterwards. **The counterfactual that works:** commit first, mutate, run,
  `git checkout -- <file>`, then grep to prove the probe is gone AND the real
  code is back. That is how ballisticscheck was shown to discriminate (5/7 with
  the muzzle taken back out of `predictLanding`, red on the sign test at 10
  long / 1 short).
- **FORWARD IS `(−sin yaw, −cos yaw)`.** Measured on the server four ways, not
  assumed. Walking a body with `(+sin, +cos)` marches it briskly in the opposite
  direction and yields a beautifully consistent set of numbers about a journey it
  never made — which is how the first refill trace "showed" the world emptying on
  the way home while the body was still walking away.
- **A probe that never revisits ground cannot see a refill bug.** Four bodies
  walking outward in straight lines gave identical numbers with the bug and
  without it. The movement has to come BACK.

- **A `//` COMMENT PUT INSIDE `boardHtml()`'s TEMPLATE LITERAL IS NOT A COMMENT**
  — it is page text, and any backtick in it ENDS THE STRING. One sentence
  mentioning `` `did()` `` turned board.js into a syntax error. **And `npm run
  build` was green**, because vite never compiles `server/` at all. The only
  gate on a server file is running it: `node -e "import('./server/board.js')"`.
  **But NOT on a `*check.js` file** — every one of them ends in `main().catch(…)`,
  so importing it does not check it, it RUNS it. That probe cost a full 150 s
  huntcheck and a spawned server on 8096 before it printed a single line. Use
  `node --check <file>` for syntax; it is instant and it does not play the game.
- **`| head -N` ON A CHECK LOOKS EXACTLY LIKE THE CHECK DYING EARLY.** The same
  probe came back showing two PASS lines and then nothing, which reads as a
  harness that exited after the second assertion. `head` had closed the pipe.
  Exit code was 0 and the run was fine.
- **A FED-IN FAKE MADE OF A PLAIN OBJECT AND TWO BORROWED METHODS STOPS TESTING
  ANYTHING THE MOMENT THE REAL METHOD GROWS A THIRD CALL.** `notePack` was
  driven as `Agent.prototype.notePack.call(fake, iv)`; it now calls `noteMake`,
  which calls `did`, and the fake died with *"this.noteMake is not a function"*
  — in a check that was otherwise green. Build the body with
  `Object.assign(Object.create(Agent.prototype), {…state})` so the METHODS are
  real and only the state is invented. The existing four-field `fake` in
  survivalcheck survives only because it never enters the make window.
- **`server.close()` NEVER CALLS BACK while a keep-alive socket is open**, and
  both a watching browser and `fetch` hold one. The port goes quiet, the process
  sits idle at half a second of CPU, and it reads exactly like a spin loop
  somewhere else — twenty minutes hunting one that did not exist. Track the
  connections and `destroy()` them; `boardcheck` now TIMES the close, because the
  broken version does finish eventually, on a good day, which is worse.
- **CHECK YOUR INSTRUMENT BEFORE BELIEVING IT.** timbercheck's first pass
  compared collider positions at 1e-6 and reported 2048 of 2149 trees "wrong".
  The colliders come back out of a **Float32Array**. The bug was the check.
- **A tally of intents is not evidence of an outcome.** `arriveWithin` is 6 m and
  `PICKUP.radius` is 2.2: a body pressed E thirty-five times at nothing and every
  check read it as gathering.
- **A FIXTURE WRITTEN FROM THE SAME GUESS AS THE CODE DOES NOT TEST IT, IT
  RATIFIES IT.** boardcheck passed 31/31 on a board that reported seven straight
  misses as "7 arrows, 7 hit", because the invented agent used `hit: true/false`
  and so did the board — while the simulation puts a SURFACE NAME there. Copy
  fixture values out of a real payload, not out of your own assumption.
- **`me.f` arrives at 20 Hz against a body running at 30** — anything the server
  confirms needs a cooldown on this side.
- **The agent's game clock wraps at 24.** Count real seconds off `dt`.
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
