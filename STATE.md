# State of play — read this first, it is short on purpose

`FINDINGS.md` is 3300 lines and `DEV-NOTES.md` is 2900. Reading either cold costs
more context than the work does. This file is the current state. **Update it at
the end of every run**, and cut the closed section rather than letting this
become another archive — all of it is in `FINDINGS.md` under its dated heading.

Last updated: 2026-08-05 16:25, by the session that closed queue #1 — the
weather. **The two-copies-of-one-number family is now finished: all six.**

## What works right now

- **EVERYBODY IS UNDER THE SAME SKY.** The last of the six. `snap.w`
  (`{s, n, b, a}` — state, next state, blend, wind angle) has been on the wire
  since there have been snapshots and nothing read it; now `Weather.applyRemote`
  does, RAW from `onSnapshot`. The divergence was **phase, not seed** — two
  clients booted together agree exactly, but your front starts when your browser
  does, so the error grows with server uptime. Watched on a real socket: a front
  arriving over the wire, `clear → rain`, twelve samples across 24 s with the
  client's blend and wind angle equal to the server's on every one (b 0.905 →
  1.000, cloud 0.05 → 0.95, rain 0 → 1.00, wind ×0.70 → ×1.90) and the picture
  following. Forced to `rain` by hand, it read the server's `clear` back 1.5 s
  later. Photographed: `shots/rain-came-from-the-server.jpg`. `npm run
  weathercheck` (**27/27**, new, needs no server) drives both ends.
  **Why it mattered more than it looks:** your temperature became the server's an
  hour earlier, and the HUD explains a falling temperature with the wind chill and
  rain it can SEE. Measured at one spot in one minute — felt **8.87 °C** under the
  server's rain against **19.50 °C** under the sky the browser was inventing.
- **HOW COLD YOU ARE IS THE SERVER'S NUMBER.** `Body.applyRemoteCore` +
  `remoteCore` + `takeOverLocally`, delivered RAW. Only the ten lines that
  integrate `coreC` stand aside; `feltC`, `effectiveC`, wetness and the
  environment sample still run locally because that is what the HUD *explains*
  you with. Watched at 02:30: no fire, core −0.168 °C/min; fire 3.00 m away,
  −0.096 °C/min. `npm run warmthcheck` (**20/20**, needs no server).
- **EVERYBODY SEES THE SAME FIRE, AND IT WARMS THEM.** `fi` in the snapshot,
  `Fires.applyRemote` mirroring it, the fuel clock standing aside while remote.
  Feeding a fire goes up the wire too — a `C_FIRE` claim landing ON a fire is
  fuel for it, one packet doing both. Watched: their fire on my screen 6.68 m
  away one packet after they lit it; 3 m from it, `fireWarmth` 5.46 °C. `npm run
  firecheck` (**57/57**, needs no server).
- **It is the same time of day for everybody.** `Atmosphere.applyRemote` takes
  `snap.c`; the local clock stands aside while remote. Agreeing to 3 dp against a
  server staged at 01:00 where the same client used to draw a blue midday sky.
  `npm run clockcheck` (**21/21**, needs no server).
- **Your health is the server's health.** `#hl-health` 89% → 0% → hidden → 89%,
  watched; before this the browser read 100 through two deaths. Death lasts what
  the config says and **you wake on the shore, not where you fell**. `npm run
  deathcheck` (**19/19**).
- **Your body is where the server says it is.** 0.00 m on both join paths, yaw
  agreeing. `netcheck` (**24/24**) guards it from both ends.
- **A companion bites for its owner, everyone sees it — including the owner.**
  `bitecheck` (10/10). Your animal comes with you onto a server with its name,
  trust, tricks and standing orders. `guard` can be switched on from a client.
- **You can fight a goblin in daylight.** Everyone hunts the same animals, arrows
  hit players, wounds persist, the cull is per-player, standing orders are obeyed.
- The picture fits the window at any scaling; a fire can be seen and heard; the
  arrow's predicted impact is within 1–2 cm; the glider flies where you look; the
  client reads world events; chat is a column; `B` opens a build chooser; `E`
  obeys one distance rule and always answers.

**All suites green this run** on a quiet box: `firecheck` 57, `companioncheck` 45,
`campcheck` 36, `glidercheck` 32, **`weathercheck` 27**, `netcheck` 24,
`mindcheck`/`clockcheck` 21, `warmthcheck` 20, `deathcheck` 19,
`bookcheck`/`reportcheck` 18, `ordercheck` 17, `dangercheck` 12,
`arrowcheck`/`woundcheck` 7. **`deathcheck`, `clockcheck`, `firecheck`,
`warmthcheck` and `weathercheck` are not in the standing check list in the run
instructions — run them anyway.** None of the five needs a server.

## The one rule the whole family came down to

**Two copies of one number is the bug, and the fix is always the same four
pieces**: `applyRemote`, a `remote` flag that stands aside *only the
integration*, a `takeOverLocally` for when the socket drops, and a guard that
ignores a bad value rather than obeying it. Position, health, hour, fuel,
warmth, weather — six for six.

- **Stand aside as NARROWLY as you can.** Everything upstream of the owned number
  is local presentation of a local world and must keep running, or the HUD stops
  explaining anything. In `Weather` that is two things only: the state machine
  and the one line that integrates `windAngle`. The blended values are
  *derivation*, not opinion — same arithmetic on both ends — so they keep running.
- **Owning a number on the server breaks whatever wrote it locally.** Grep for
  every local writer before calling the fix done, and make it SAY so rather than
  silently doing nothing (`setWeather` now returns a refusal, as `warp` does).
- **Everything in `me` and `snap` is delivered RAW from `onSnapshot`**, not
  through the interpolator — that buffer is for smoothing BODIES.
- **Do not ask a question the server has already answered.** Take the OUTCOME.

## Things that will waste your time if you do not know them

- **`ctrl.yaw = x` IS THE SAME TRAP AS `ctrl.position.set` AND `warp`.** The
  intent carries `lookYaw`/`lookPitch` as DELTAS (`controller.js:97`), never an
  absolute — so a hand-assigned yaw is invisible to the server and it walks your
  body along the yaw it still holds. Cost this run **83.67 m** of split and a
  refused fire (*"too far from you to be yours"*), which looks exactly like the
  fire fix being broken. Untouched, the same 5 s walk splits **0.07 m**. To aim a
  headless body, re-align with `ctrl.position.set(...snap.me.p)` and `ctrl.yaw =
  snap.me.y`, or feed `lookYaw` deltas — and **print the split before believing
  anything positional**. `snap` is live at `highlands.net.buffer[len-1].snap`.
- **Sandbox pins `feltC`/`effectiveC`/`wetness` while `coreC` keeps falling.**
  `effectiveC` read exactly 19.00 in a gale and full rain — the local thermal
  model is frozen by `ruleset.current.survival === false` while `coreC` still
  moves because it is the server's number. It looks precisely like a new fix
  failing to reach the body. Set `highlands.ruleset.current.survival = true` in
  place (`spawnPack` needs Sandbox, stamina needs Survival).
- **`netcheck` on a loaded box fails the COMPANION line too, not just the budget
  line** — 22/24 with a browser connected (121.7 KB/s, and "it went with her" at
  3.6 m), **24/24** with the server to itself. Quieten the box and re-run before
  believing either failure.
- **A number the server refuses is invisible from both ends unless it is
  printed.** The server logs every fire claim it takes or drops, with the reason.
  That one line turned a wrong guess into an answer in a single run. Log at the
  RECEIVING end before theorising about the sending end.
- **`HOURS=1` MOVES THE SPAWN TO THE OTHER SIDE OF THE LAKE** (~420 m) —
  `pickSpawn` stands you on the shore opposite the sun. Any measurement comparing
  a staged server against an unstaged one is comparing two different places.
- **A number that reproduces exactly is a CONFIGURATION, not a drift.** Ask what
  was different about the *launch* before looking for a leak.
- **Your own source edit reloads the page out from under your measurement.**
  Fresh world, mode back to Survival, no fires. Re-click the mode button and
  re-check `highlands.ruleset.current.id`. `git log --oneline -3` and `git pull`
  first too — a second session can be live on :8080.
- **Stale processes: kill them at the END of your run, not just the start.**
  `server.js` survives its wrapper, holds 8080 and ticks into a closed pipe. Find
  with `wmic process where "name='node.exe'" get processid,commandline` and grep
  for `server.js`/`agents.js` — **not** the project path. **A backgrounded
  `server.js` can be reported EXITED while still listening**; `netstat -ano |
  grep ":8080.*LISTENING"` is the fact.
- **A KEY RELEASE YOU DO NOT STEP IS NEVER SENT**, and the server holds
  `forward: 1` for ever — 36.1 m of split with the client stationary. After a
  keyup, keep stepping for at least `1000/NET.intentHz` ms of REAL time.
- **Keys must be dispatched on `window`, not `document`.** A `document` keydown
  moves nothing and throws nothing — 0.00 m against 1.66 m.
- **Pace `stepWorld` to the WALL CLOCK for anything networked.** Twelve steps per
  60 ms is 3.3× speed and the server does not come with you: it showed up as a
  28.34 m split that looked like a regression. Accumulate real elapsed time.
- **The socket keeps delivering while `stepWorld` is not running** — deaths,
  respawns and teleports all land between two tool calls. **Do the whole
  observation in one cell**, and never compare a position across two.
- **`javascript_tool` gives up at 30 SECONDS** and returns nothing, though the
  world keeps running behind it. **`const` in the console leaks between calls** —
  wrap every call in `(async()=>{ ... })()`.
- **NEGATIVE `ctrl.pitch` LOOKS DOWN**, and `pitch` is damped back to
  `targetPitch` every step — set BOTH. Aiming at something on the ground is
  `-atan2(eyeY - targetY, distance)` using the CAMERA's y, not `ctrl.position.y`
  (which is feet: getting that wrong gave +0.44 and photographed the sky).
- **The player's yaw is the OPPOSITE convention to a companion's** — aiming the
  body at something is `atan2(dx, dz) + PI`.
- **Two check harnesses run back to back collide.** `spreadcheck` then
  `shotcheck` gave 4/8; `shotcheck` alone gives 8/8. Re-run the loser on its own.
- **A fresh server does NOT clear the duplicate roster** — it is a name collision
  between the server's rival hunters and the `agents.js` pool. Restarting is waste.
- **`HOURS=1 RAID=6` are knobs on `server.js`**, off by default. Goblins are
  night-only, a day is 26 real minutes, and a lone goblin has morale 0.00 and
  runs. **Attach the witness before you start the fight** — goblins cover 26 m and
  draw blood in three seconds. **A goblin on 4 hp standing 0.1 m away does not
  swing**; restart for a fresh `RAID` rather than waiting on wounded ones.
- **A long survival test measures FOOD, not what you think** — 40 real minutes is
  32 in-world hours and a shivering body starves first. Pin `hunger`, or keep to
  one night (8.7 min). **Deer wander** — read a position once and you aim where it
  used to be.
- **`highlands.report({steps})` wants an ARRAY.** `agentcheck` is 16/17,
  pre-existing. `netcheck` needs a server up.
- **The scatter collider field is `highlands.scatter.colliders`**; a creature's
  Object3D is `c.object`; lit fires are `highlands.fires.active`; `hud.heard`
  holds objects — read `h.text`.

## The game queue, ranked

1. **Your food is still your own opinion, and the fix is NOT one line.** Blocked
   on #5: nothing can ever feed the server's copy of you. `intent.eat` is on the
   wire and no handler reads it, and the server's `p.inventory` is not your
   inventory — so reading `me.f` today means eating does nothing (overwritten
   ~5×/s) and everybody starves on a schedule they cannot touch. The route in is
   an `intent.eat` handler plus a server-side inventory, not a read. **This is
   the first thing on the list that is NOT in the applyRemote family** — do not
   reach for those four pieces here, they will not fit.
2. **A stranded glider cannot be recovered.**
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it.
4. **Arrows fired at ~0 m all miss.** Four full-charge shots at a motionless
   goblin standing on top of me did nothing. Unexamined.
5. Multiplayer carcass harvesting fills a LOCAL inventory only, and a mirrored
   animal's morale/`hurt` flags are never sent.
6. **Nothing else comes back DOWN about your own animal.** The fight now does
   (`g` + `mirrorFight`); the server still cannot say the pet was hurt, fed by
   somebody else, or killed. `g` is the pattern to copy.

**UNCOMMITTED IN THE WORKING TREE — decide, do not just inherit it.**
`src/world/pickups.js` carries an unfinished thread from an earlier run: a
`taken` Set parameter on `deadfallNear`/`nearestDeadfall`, so a caller can
exclude branches it has already carried away. **It is inert** — it defaults to
`null` and no caller passes it — and the real bug it was written for is still
open: `src/net/agent.js:527,535` calls `nearestDeadfall` with no memory, so an
agent's `gather` walks to the same branch for ever. Driven by hand this run with
a `taken` set it worked exactly as advertised (four different branches, 16.2,
15.1 and 14.1 m apart, instead of standing still). Finishing it is: give the
agent a Set, add the key on pickup, pass it. Small, and worth one run.

**Measured 11:40, not a regression, worth a decision:** a companion trails a
CONTINUOUSLY MOVING owner at about its own `runRange` — inside that range
`think` only walks it and every species walks slower than a person. Invisible in
single player because people stop constantly; glaring with agents, which never do.

**Unmeasured, worth one run:** with 4 players the server's population drifted
68 → 37 over ~24 game minutes (cap is 120, so not the cap), across 02:00–05:00.
Daybreak retiring the night shift would explain it; so would `clearedSites`
sterilising ground. Nobody tested which — do not repeat it as fact.

## How to play it

```
npx vite --port 5173 --strictPort
DANGER=no-bears node server/server.js 8080
HOURS=1 RAID=6 DANGER=full node server/server.js 8080   # staged for a fight
PET=hippo ORDERS=obeys node server/agents.js 2
```

`PET=<species>` gives every agent an animal — the only way to SEE another
player's companion without a second human. The mind is not told it exists.

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button (**Sandbox** if you need `warp` or `spawnPack`), then drive
with `window.highlands.stepWorld(1/60)` — in REAL time, `setTimeout` between
steps, for anything networked. **The pane does not composite when it is not
displayed**, so `requestAnimationFrame` never fires and the world looks frozen
and connected-but-dead. Not a bug; it is why `stepWorld` exists. It also reports
a **0×0 viewport**, so clicking the mode button by element ref lands at a
negative y and silently starts Survival — click it from the page instead
(`[...document.querySelectorAll('button')].find(b=>/Sandbox/.test(b.textContent))
.click()`) and check `highlands.ruleset.current.id`.

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**, it
is the only way anyone sees this game; under ~5 KB means the blind-pane bug is
back. And **you can press keys**: `window.dispatchEvent(new KeyboardEvent(
'keydown', {code:'KeyE'}))`, one `stepWorld`, then the matching `keyup` drives
E / W / G / B — walking, gathering, lighting (**G**), building and sprinting all
work headlessly.

## The trap this project falls into

**A name used and never defined** — `clamp`/`damp`, `vitals.hurt`,
`appendFileSync`, `amountText`, `SPECIES`, `audio.fireLit`. Invisible to build;
only found by running the line. Grep every identifier your new code uses.
**And a clean build proves nothing.** Verify by driving the game.
