# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 10:55, by the session that made goblins killable in daylight.

## What works right now

- **You can fight a goblin in daylight.** It routs on sight as before, but it
  now spends its breath doing it and then goes to ground where you can reach it.
- **Everyone hunts the same animals**, arrows hit players, wounds persist, the
  cull is per-player, standing orders are obeyed. All suites green
  (`raidcheck` **18**, `campcheck` 36, `glidercheck` 32, `companioncheck` 29,
  `mindcheck` 21, `bookcheck`/`reportcheck` 18, `ordercheck` 17,
  `netcheck`/`herdcheck` 12, `dangercheck` 12, `rendercheck` 12,
  `spreadcheck` 10, `shotcheck` 8, `arrowcheck`/`woundcheck` 7).
- **The picture fits the window** at any monitor scaling or browser zoom; **a
  fire is something you can see and hear** (`shots/fire-at-3m-night.jpg`); **you
  can see where your arrow will land** (predicted impact within 1–2 cm of a
  loosed one); **the glider flies where you are looking**.
- The client reads world events; chat is a column on the right; `B` opens a
  build chooser; `E` obeys one distance rule and **always answers** — gather,
  build and launch refusals all state their condition.

## Recently closed — details in `FINDINGS.md` under the dated heading

- **"Goblins are unkillable in daylight"** (10:45). The broken branch of
  `thinkPack` was the ONLY flight in `creature.js` that never spent stamina (the
  prey bolt and the bear break-off both do `stamina -= dt` then drop to `trot`),
  so it held `flee` 7.6 m/s for ever and `goblin.stamina: 14` was dead data.
  Against a 9-second sprint that is invulnerability, not escape: in Survival,
  5.9 m behind one became **159 m** in 55 s, still opening. Now it tires, and
  **in daylight a blown goblin goes to ground** (`goneToGround`, speed 0), so
  they are avoidable rather than unreachable. Killed one at noon. Night is
  untouched. Guarded by `raidcheck`, 18/18.
- **"Window resize wrecks the sim"** (10:15). `setPixelRatio` ran once at boot
  and `syncSize` early-returned on CSS size alone, so a DPR change never reached
  the renderer. `EffectComposer` already sizes every pass by its cached ratio,
  so the wrapper's extra `bloom.setSize` re-shrank bloom. By `rendercheck`.
- **Both fire bugs** (09:35, 09:50) — laid below the frame, `Soundscape.fireLit`
  never written and `?.` ate it, and a roofed fire still rained on. Guarded by
  `campcheck`.

**Two lessons worth keeping, both about trusting a queue entry's own words.**
The resize entry inherited a RETRACTED symptom as its title and would have sent
a fifth session hunting a stopped clock: **check the symptom still stands before
you hunt its cause.** The goblin entry carried a measured *number* that was
taken in the wrong game mode and pointed the opposite way: **check which mode a
number was measured in** — Sandbox has no hunger, no stamina, and no thirst.

## Things that will waste your time if you do not know them

- **Your own source edit reloads the page out from under your measurement.**
  Editing `src/*` bounces the client through Vite: fresh world, mode back to
  **Survival**, `audio.ready` false, no fires — so the next reading throws, or
  worse, quietly measures an empty world. Re-click the mode button and re-check
  `highlands.ruleset.current.id` after any edit. Check `git log --oneline -3`
  and `git pull` first too: a second session can be live on :8080, and your
  reload dumps its player to the menu.
- **Stale processes: kill them at the END of your run, not just the start.** A
  backgrounded `agents.js` dies with the wrapper but `server.js` survives, holds
  8080 and ticks into a closed pipe. Find them with `wmic process where
  "name='node.exe'" get processid,commandline` and grep for `server.js` /
  `agents.js` — **not** the project path, which is cwd-relative and will miss.
- **A fresh server does NOT clear the duplicate roster.** `[#1 Eachann, #4
  Eachann, #5 Morag]` is a name collision between the server's rival hunters and
  the `agents.js` pool, not stale state. Restarting to fix it is waste.
- **`warp` does not cancel a glide** — `updateFlight` rewrites `ctrl.position`
  every step. Step until `highlands.flight` is falsy before measuring. `warp` is
  refused in Survival (it *returns* the refusal as a string) and the server
  never hears it, so any networked measurement after one is worthless.
- **Deer wander.** Reading a deer's position once and then stepping through a
  long scan aims you where it used to be — it cost a run two wrong readings.
- **A long survival test measures FOOD, not what you think.** `dayMinutes: 26`,
  so 40 real minutes is 32 in-world hours and a shivering body (`hungerColdMul`
  1.9) starves first. Deaths reported at 34.9 C — *above* the 33.0 cold
  threshold — were all starvation. Pin `hunger`, or keep to one night (8.7 min).
- **Sandbox freezes survival** (`ruleset.current.survival` false), so hunger and
  stamina never move and any endurance number taken there is meaningless — it is
  what made the old goblin-chase arithmetic point the wrong way. `spawnPack`
  needs Sandbox and stamina needs Survival, so: click Sandbox, spawn, then set
  `highlands.ruleset.current.survival = true` in place. A reload would lose both.
- **`ctrl.pitch` is damped back to `ctrl.targetPitch` every step** — writing
  `pitch` alone is erased before the next frame, and you will miss a stationary
  target at point blank and blame the arrows. Set BOTH (`targetYaw`/`yaw` too).
  Sweep `targetPitch` and read `highlands.aimMark.mesh.position` for the firing
  solution in one pass; at 12.4 m against a standing goblin it is −0.10.
- **The sun is `clock.hours`, not `wildlife.ctx`** — `SimWorld.step` rebuilds
  the context from `solarPosition(clock.hours)` every step, so setting
  `wildlife.ctx.sunAltitude` does nothing. Set `clock.hours` + `running=false`.
- **`highlands.report({steps})` wants an ARRAY.** A string throws and files
  nothing. **`agentcheck` is 16/17**, pre-existing. **`netcheck` needs a server
  up** or it prints "could not run" and no score.
- **The scatter collider field is `highlands.scatter.colliders`** — the other
  one's `.list` is empty, so a tree search against it silently finds nothing.
  **A creature's Object3D is `c.object`**, not `root`/`group`/`mesh`.
  **Lit fires are `highlands.fires.active`** — there is no `.list`.
  **`hud.heard` holds objects, not strings** — `.join()` gives you
  `[object Object]`; read `h.text`.

## The game queue, ranked

1. **Companions do not exist in multiplayer** — `Companion` appears 0 times in
   `sim/world.js`.
2. **A stranded glider cannot be recovered.**
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it.
4. **Arrows fired at ~0 m all miss.** Four full-charge shots at a motionless
   goblin standing on top of me did nothing. Probably the same family as the
   axe-misses-in-a-swarm note. Unexamined.
5. Multiplayer carcass harvesting fills a LOCAL inventory only, and a mirrored
   animal's morale/`hurt` flags are never sent. Small and deliberate, for now.

**Unmeasured, worth one run:** with 4 players the server's population drifted
68 → 37 over ~24 game minutes (cap is 120, so not the cap), across 02:00–05:00.
Daybreak retiring the night shift would explain it; so would `clearedSites`
sterilising ground. Nobody tested which — do not repeat it as fact.

## How to play it

```
npx vite --port 5173 --strictPort
DANGER=no-bears node server/server.js 8080
ORDERS=obeys node server/agents.js 2
```

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

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**,
it is the only way anyone sees this game; under ~5 KB means the blind-pane bug
is back. The HUD is DOM and can never appear in one, but it still lays out
against the 1280×720 capture forces, so `getBoundingClientRect()` gives real
numbers to measure the world against. And **you can press keys**:
`dispatchEvent(new KeyboardEvent('keydown', {code:'KeyE'}))`, one `stepWorld`,
then the matching `keyup` drives E / G / B without pointer lock, so gathering,
lighting, building and sprinting all work headlessly.

## The trap this project falls into

**A name used and never defined** — `clamp`/`damp`, `vitals.hurt`,
`appendFileSync`, `amountText`, `SPECIES`, `audio.fireLit`. Invisible to build;
only found by running the line. Grep every identifier your new code uses.
**And a clean build proves nothing.** Verify by driving the game.
