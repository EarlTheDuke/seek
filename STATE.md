# State of play — read this first, it is short on purpose

`FINDINGS.md` is 3400 lines and `DEV-NOTES.md` is 2900. Reading either cold costs
more context than the work does. This file is the current state. **Update it at
the end of every run**, and cut the closed section rather than letting this
become another archive.

Last updated: 2026-08-05, by the run that finished the ladder.

## THE LADDER IS DONE. All six rungs green.

**1. SURVIVE — green.** `survivalcheck` 7/7. Unchanged this run.

**2. HUNT — GREEN, and it was the big one.** `huntcheck` 7/7, **five runs, five
kills, ONE arrow each, 59-72 s**. It was 1-of-4 at 103-150 s. Three separate
things, each found by instrumenting rather than reasoning:

- **The check was passing on kills the agent did not make.** Nothing on the wire
  said WHO killed an animal, so a wolf eating a deer read as a hunt. The baseline
  run this session was 5/6 green — "AND IT BROUGHT ONE DOWN" included — from a
  body that loosed ZERO arrows. `kill` events now carry `by`.
- **It fired more arrows by accident than on purpose.** The server edge-detects
  `intent.primary`, so ANY true→false is an arrow: every path that stopped
  drawing (lost quarry, a re-solve, standing up, hunger taking the tick) shot the
  hillside at a third of the solver's speed. 5 strays to 2 aimed in one run.
  `letdown` is now an intent, resolved BEFORE the trigger edge.
- **TREES WERE INVISIBLE TO EVERY SHOT CHECK.** Both aimed arrows of a run ended
  `hit tree`. `src/world/timber.js` states the placement as arithmetic both ends
  run — `Scatter` now draws that answer instead of owning it. `timbercheck` 17/17
  matches all 2149 trunks, crowns and boulders against the world's own collider
  field, both directions.
- Bonus, from the same thread: **the server's solid world was one patch around
  player #1**, so everybody else shot through a forest their own browser was
  drawing. `SimWorld.refreshTimber` covers every player.
- Also new: a `wound` event. An arrow that landed and left the deer standing used
  to be indistinguishable from never firing.

**3. MANY MINDS, MANY PROVIDERS — green.** `providercheck` 25/25. Untouched.

**4. PERSONAS — GREEN, both halves.**
- `src/minds/personas.js`: six dispositions, `PERSONAS=off|on|hoarder,liar,…`.
  Off is BYTE-IDENTICAL to the old prompt and `personacheck` asserts the bytes
  against a hand-written baseline. On deals from a shuffled deck, seeded.
- Who was who is in the console header, the end-of-run summary and the report.
- **Scarcity**, the half that makes character mean anything: `SCARCE=on` (or
  `0.5,0.8`). One low-frequency richness field feeds BOTH firewood and herd
  density, so the valley with the deer has the wood to cook them. Measured: 52%
  of the firewood gone, 3 branches in the barest 100 m against 47 in the richest,
  18 animals near a spawning player down to 4. **That last number is worth an
  eye — `SCARCE=0.7,0.5` is the gentler setting if a full roster starves.**
  It rides in the welcome, because the client draws firewood itself.

**5. WATCHABLE — first mile green.** `systemPrompt` has asked every model for
`"why"` since minds existed and `sanitiseGoal` dropped it on the floor. Kept now,
and `NARRATE=on` makes each mind say its goal, reason and persona into the chat
column as it changes its mind — no protocol, no view code, the HUD already draws
chat. `watchcheck` 10/10, asserted from the watcher's seat.

**6. A FULL ROSTER — green.** `MAX_PLAYERS` 8 → 16 (`MAX_PLAYERS=` to change).
`rostercheck` measures rather than assumes, with every body hunting (the
heaviest thing one does):

| house | tick | snapshots | wire per client | total |
|-------|------|-----------|-----------------|-------|
| 12    | 60.0 Hz | 20.0 /s | 56.3 KB/s | 675 KB/s |
| 16    | 60.0 Hz | 20.0 /s | 64.8 KB/s | 1.0 MB/s |

Nobody dropped, everybody in the same world. The tick does not budge; the WIRE is
where the ceiling will be, and every player is in everybody else's snapshot, so
the total grows with the SQUARE of the roster. `node server/rostercheck.js 8091 24`
before anybody promises thirty-two.

## For tomorrow night

```
DANGER=no-bears SCARCE=on node server/server.js 8080
MINDS_ROSTER=roster.json PERSONAS=on NARRATE=on npm run agents   # keys in the ENVIRONMENT
npx vite --port 5173 --strictPort
```

The header prints what is ACTUALLY about to play — a line per player, its model,
its character, and `(no XAI_API_KEY)` beside anyone who quietly fell back to
scripted. Read it. Other knobs, all off by default: `HOURS=1`, `RAID=6`,
`STOCK=venison:2`, `HUNGER=52`.

## Checks

`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · `campcheck` 36 ·
`weathercheck` 27 · `providercheck` 25 · `netcheck` 24 · `personacheck` 21 ·
`mindcheck`/`clockcheck` 21 · `warmthcheck` 20 · `deathcheck` 19 ·
`bookcheck`/`reportcheck`/`raidcheck` 18 · `timbercheck` 17 · `agentcheck` 17 ·
`ordercheck` 17 · `dangercheck`/`herdcheck`/`rendercheck` 12 · `bitecheck` 10 ·
`spreadcheck` 10 · `watchcheck` 10 · `scarcecheck` 9 · `shotcheck` 8 ·
`survivalcheck`/`huntcheck` 7 · `arrowcheck`/`woundcheck` 7 · `rostercheck` 6.

Ports: rostercheck **8091**, watchcheck **8092**, scarcecheck **8094**,
survivalcheck 8095, huntcheck 8096, herdcheck 8098, shotcheck/bitecheck 8099.
`netcheck` and `survivalcheck` want a quiet box.

## Known red, and honestly so

- **`netcheck` "creatures are shared — 0 creatures" fails intermittently.**
  Confirmed NOT a regression from this run's work — it fails identically with
  everything stashed. Bob's snapshot has no creatures in it at all, which if it
  is real is a bug worth having. Nobody has instrumented it.
- `netcheck` "it went with her" (a companion trailing a continuously moving
  owner) is the long-known load-sensitive one.

## The queue, ranked

1. **Instrument the empty `cr` list above.** Two players, one snapshot, no
   animals — that is either a culling bug or a snapshot-budget cut nobody
   documented, and it would gut an evening.
2. **A live board, not a chat column** (rung 5's second mile). `intentions`,
   `deeds`, `refusals` and `shots` are all kept and only the first is surfaced,
   through chat.
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` while integrating
   flight in `(+sin, +cos)`. Establish which way `wind.angle` points first.
4. **Arrows fired at ~0 m all miss.** Unexamined since the aim fix.
5. **Nothing comes back DOWN about your own animal** — hurt, fed, killed.
6. **Crouch is a uniform Y squash of the whole avatar.**
7. With 4 players the server's population drifted 68 → 37 over ~24 game minutes
   (cap 120). Still unmeasured; may be the same thing as (1).

## Things that will waste your time if you do not know them

- **CHECK YOUR INSTRUMENT BEFORE BELIEVING IT.** timbercheck's first pass
  compared collider positions at 1e-6 and reported 2048 of 2149 trees "wrong".
  The colliders come back out of a **Float32Array**. The bug was the check.
- **A tally of intents is not evidence of an outcome.** `arriveWithin` is 6 m and
  `PICKUP.radius` is 2.2: a body pressed E thirty-five times at nothing and every
  check read it as gathering.
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
