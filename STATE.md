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

Last updated: 2026-08-06, by the run that measured the bow and found the bug was
in the ruler.

## THE BOW IS UNDERSTOOD. Queue item 0 was the INSTRUMENT, not the ballistics.

`npm run ballisticscheck` — **7/7**, port 8088. A real body on a real server, a
staircase of six ranges from 15 m to 70 m, two shafts each, every one compared
against `predictLanding`. **Median 0.17 m from where our own model said it would
come down**, at landing distances out to 151 m. Six long, six short.

### "arrows land LONG and the error grows with range" was geometry

`howItMissed` measured the impact against the MARK, and the mark is a deer's
chest 0.75 m above the ground the deer stands on. **An arrow that passes exactly
through that chest does not stop there.** At 20 m the shaft is descending at
barely two degrees, so shedding the last 0.75 m of height carries it another
**fourteen metres**. A flawless archer reads "+14 m long" on that scale, and the
sign is a foregone conclusion for every shot not stopped by a bank.

So the board's *"3 m long at 20 m"* — eight of them from one body, written up
here as a systematic bias whose magnitude grew with range — was an arrow landing
**eleven metres SHORT of a perfect one**. The sign was inverted and the trend
was an artifact. The very first live payload read the right way settled it:
`along +2.8 m` against the deer, **`model 0.3 m`** against the bow.

`vsModel` is the honest column now, and it is what the board, huntcheck and the
agent's own MEMORY all report. That last one mattered: the mind was being told
in its prompt that its arrow flew long when it had fallen short.

### and there WAS a real bias underneath, ten times smaller

Twelve arrows, twelve of them long of prediction, +0.05 to +0.91 m. A magnitude
inside marksmanship and a sign that never flipped once — which is a bias.
`Bow.fire` spawns the shaft **0.55 m along the aim line** so it clears the
archer's own capsule; every model of the bow launched from the eye. Now
`BOW.muzzle`, read by the bow and by all three integrators in marksman.js.

Measured before and after on the same ground: median gap **0.18 → 0.11 m**, mean
along error **+0.31 → +0.07 m**, signs **12/0 → 6/6**. It moves the solved pitch
about 1.4 mrad and takes 1.5 cm at 10 m to 8.5 cm at 60 m off the top of the arc
— under `BOW.spreadFull`, so a correction and not a transformation. **Do not
expect it to make huntcheck seven-for-seven.** The browser's own aim mark was
always right; `previewShot` had the offset all along.

## A BODY CAN SAY IT PICKED SOMETHING UP — queue item 2, closed

`did()` had five call sites and gathering was not one of them, so the board's
"did" column read *"nothing worth telling yet"* beside a pack holding three
branches. **Driven off the inventory RISING on the server's own snapshot**, not
off the keypress — `arriveWithin` is 6 m and `PICKUP.radius` is 2.2, so a body
can press E at nothing all afternoon. `Agent.notePack`.

Live: **23 reaches, 28 items in the pack.** Those were one number before, and
the session report now spells the gap out so nobody adds them up. Three things
that also make a number go up: a cook or craft owns the pack for
`AGENTS.makeOwnsPackFor`; the starting kit is adopted in silence; a FALL is
never a deed. Consecutive pickups grow one line — *"I picked up 27 branches"*,
observed — because `deeds` is five deep on the board and nine branch lines
would push the kill and the fire off the end of it.

**"branch" + "s" is "branchs"**, and the item whose id is `wood` is called a
Branch — the naive plural was wrong on the commonest pickup in the game.
`Agent.plural`. `survivalcheck` **11/11**, `reportcheck` **20/20**.

**And it discriminates, on a live socket.** With `makeOwnsPackFor: 0` the same
run reports *"I picked up 2 cooked venison"* — a steak the body cooked itself,
announced as something it found lying about — and survivalcheck goes 10/11 red
on exactly that line. The window is load-bearing, not decoration.

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

**1. SURVIVE** `survivalcheck` 7/7 — forage, light, cook, eat, live the night.
**2. HUNT** `huntcheck` six of seven runs, one arrow, kills at 59-109 s. The
seventh is the marksmanship tail, not an empty hillside. DO NOT TUNE CONSTANTS
ON ONE RUN — three passes of that moved the failure around without fixing it.
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
`shotcheck` 8 · **`survivalcheck` 11** · `huntcheck` 7 · `arrowcheck`/`woundcheck` 7 ·
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
- `huntcheck` is still the documented six-of-seven. Today, after the muzzle fix:
  **7/7, a kill inside 80 s on two arrows** — but that is ONE run and the fix is
  1.4 mrad, so it is not evidence of anything. Do not read it as a cure.

## The queue, ranked

0. ~~ARROWS LAND LONG~~ **CLOSED — it was the instrument.** See the top of this
   file and `ballisticscheck`. The bow is within 0.17 m of its own model out to
   151 m, and the one real bias in there (the 0.55 m muzzle) is fixed. **So the
   huntcheck tail is NOT ballistics** — whatever is left is the aim: the lead,
   the mark, the spread, or the shot never being taken. Item 1 is now the live
   lead, and the refusal log is the instrument for it.
1. **The one huntcheck run in seven that finds no deer.** Log where the herds
   actually were during it. It may be nothing — a thin hillside and a 150 s
   budget — but "no shot in 150 s" and "a shot it could not take" are different
   answers and only the refusal log can tell them apart. The board surfaces
   refusals live now, which is the instrument this wanted.
2. **A craft writes a deed EVERY TICK it stands at the fire.** (~~"a confirmed
   pickup is recorded nowhere"~~ closed — see the top of this file — and this is
   what closing it exposed.) Live survivalcheck: *"I worked cook venison at the
   fire"* twice at the same game hour. `did('craft', …)` sits inside the
   per-tick branch that sets `i.craft`, so a long cook pushes near-identical
   lines into a five-deep column and shoves the kill off the end of it. Same
   class of problem the gather coalescing just solved and the same shape of fix.
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
