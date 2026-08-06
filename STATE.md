# State of play — read this first, it is short on purpose

`FINDINGS.md` is 3400 lines and `DEV-NOTES.md` is 2900. Reading either cold costs
more context than the work does. This file is the current state. **Update it at
the end of every run**, and cut the closed section rather than letting this
become another archive.

Last updated: 2026-08-06, by the run that stopped the world emptying.

## THE WORLD USED TO EMPTY UNDER YOU. It does not any more.

The queue's number 1, and it earned its place. **One player, one 645 m round
trip of four minutes: he came home to ONE animal where he had left EIGHTEEN, and
nothing within 320 m of him.** The ground never came back.

`refresh` skips any site key in `spawnedSites` and NOTHING EVER TOOK A KEY BACK
OUT, so every herd site a player had once been near was dead ground for the rest
of the session. The cull's own comment had claimed otherwise since the day it
was written — "a corpse you have walked away from is gone for good; a live one
just leaves the simulation and its site can refill" — and only the corpse half
was ever implemented.

The last animal out of a herd now decides what happens to the ground: **left
alive, the site is released** and re-rolls from the same hashes, so the same cast
comes back; **died there, it is cleared for good** — you hunted it out. While any
of the herd is still loaded, neither fires: one deer shot out of five used to
clear the whole site the moment its corpse was culled, so a good night's hunting
emptied the map faster than a bad one. Cull is 400 m and spawn 320 m, so a
released site cannot repopulate under the player who just left it — the old
hysteresis holds, and the per-player budget still bounds the world.

`refillcheck` **9/9, and it discriminates — 5/9 with the fix reverted**, same
seed, same 641 m walk. Half drives the real cull inside the simulation for the
three-way rule; half walks a body over a socket and asserts the OUTCOME: 0 near
home at the far end, 18 again when he gets back. This also closes `netcheck`'s
intermittent empty `cr` — never a snapshot fault, a world that had genuinely
emptied. Single-player gets it free; it is the same manager.

**What it did NOT explain, and THE COMMIT MESSAGE OVERREACHES HERE.** It claims
the 68 -> 37 drift is the same root cause. Measured after: four bodies milling
in one valley, identical seeded paths — **peak 44 -> 27 without the fix, 46 -> 25
with it.** No difference. See the drift entry in the queue for what the numbers
actually say.

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
**5. WATCHABLE — first mile.** `NARRATE=on` makes each mind say its goal, its
reason and its persona into the chat column. `watchcheck` 10/10. The second
mile is item 1 in the queue.
**6. A FULL ROSTER** `MAX_PLAYERS` 16 (`MAX_PLAYERS=` to change), measured
rather than assumed with every body hunting: 60 Hz tick unmoved at both 12 and
16, 56-65 KB/s per client. The TICK is not the ceiling, the WIRE is — everybody
is in everybody's snapshot, so the total grows with the SQUARE of the roster.
`node server/rostercheck.js 8091 24` before anybody promises thirty-two.

## For the evening itself

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
`spreadcheck` 10 · `watchcheck` 10 · `refillcheck` 9 · `scarcecheck` 9 ·
`shotcheck` 8 · `survivalcheck`/`huntcheck` 7 · `arrowcheck`/`woundcheck` 7 ·
`rostercheck` 6.

Ports: rostercheck **8091**, watchcheck **8092**, scarcecheck **8094**,
survivalcheck 8095, huntcheck 8096, **refillcheck 8097**, herdcheck 8098,
shotcheck/bitecheck 8099. `refillcheck` walks a real body about 1.3 km and
takes roughly four minutes — the distances ARE the test, there is no shortcut.
`netcheck` and `survivalcheck` want a quiet box.

## Known red, and honestly so

- ~~`netcheck` "creatures are shared — 0 creatures"~~ **CLOSED — it was the
  world emptying, not the snapshot.** See the top of this file. netcheck now
  green three times running on fresh servers (18 creatures each).
- `netcheck` "it went with her" (a companion trailing a continuously moving
  owner) is the long-known load-sensitive one.
- `huntcheck` is still the documented six-of-seven. Today: 7/7 (a kill inside
  65 s), then 6/7 — 4 aimed shots, a deer taken to 17 hp, no kill in 150 s.
  That is the marksmanship tail, not an empty hillside; the refill fix neither
  helped nor hurt it.

## The queue, ranked

0. **The one huntcheck run in seven that finds no deer.** Log where the herds
   actually were during it. It may be nothing — a thin hillside and a 150 s
   budget — but "no shot in 150 s" and "a shot it could not take" are different
   answers and only the refusal log can tell them apart.
1. **A live board, not a chat column** (rung 5's second mile). `intentions`,
   `deeds`, `refusals` and `shots` are all kept and only the first is surfaced,
   through chat. Now the top of the queue.
2. `glider.js` samples ridge lift upwind with `(−sin, −cos)` while integrating
   flight in `(+sin, +cos)`. **Half answered: a BODY walks along `(−sin yaw,
   −cos yaw)`, measured on the server four ways.** So `(−sin, −cos)` is this
   project's forward and the glider's integration is the odd one out — but
   whether `wind.angle` means "blowing toward" or "coming from" is still
   unestablished, and that is the half that decides the sign.
3. **Arrows fired at ~0 m all miss.** Unexamined since the aim fix.
4. **Nothing comes back DOWN about your own animal** — hurt, fed, killed.
5. **Crouch is a uniform Y squash of the whole avatar.**
6. **The 68 → 37 drift — measured now, and it looks BENIGN.** Four bodies
   milling in one valley for four minutes: peak 44 → final 27, and the fix above
   changes nothing (46 → 25 on identical seeded paths). The total is not a leak,
   it tracks HOW SPREAD OUT PEOPLE ARE — `addPlayer` fans arrivals out by about
   3.3 m, so four bodies on one shore have almost entirely overlapping 320 m
   circles and draw one valley's worth between them, not 4 × 26. The number that
   matters held all run: **11–19 animals within 320 m of EVERY body, both arms.**
   Worth one more look only if somebody sees a hillside go quiet in play.

## Things that will waste your time if you do not know them

- **`git stash push <file>` AFTER YOU HAVE COMMITTED STASHES NOTHING**, and it
  does not fail loudly. A counterfactual run done that way is the fixed code
  twice: this run got two "identical" drift traces out of it and nearly wrote up
  "the fix makes no difference". Use `git checkout <old-sha> -- <file>`, and
  PRINT SOMETHING FROM THE FILE (`grep -c releaseSite`) to prove which arm is
  actually loaded before you believe a single number.
- **FORWARD IS `(−sin yaw, −cos yaw)`.** Measured on the server four ways, not
  assumed. Walking a body with `(+sin, +cos)` marches it briskly in the opposite
  direction and yields a beautifully consistent set of numbers about a journey it
  never made — which is how the first refill trace "showed" the world emptying on
  the way home while the body was still walking away.
- **A probe that never revisits ground cannot see a refill bug.** Four bodies
  walking outward in straight lines gave identical numbers with the bug and
  without it. The movement has to come BACK.

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
