# State of play — read this first, it is short on purpose

`FINDINGS.md` is 3400 lines and `DEV-NOTES.md` is 2900. Reading either cold costs
more context than the work does. This file is the current state. **Update it at
the end of every run**, and cut the closed section rather than letting this
become another archive — all of it is in `FINDINGS.md` under its dated heading.

Last updated: 2026-08-05 17:35, by the session that closed queue #2 — the
stranded wing. The applyRemote family (all six) is finished and its section has
been cut; it is in `FINDINGS.md` under 2026-08-05.

## What works right now

- **A WING CAN BE PICKED BACK UP.** Queue #2, closed. Landing somewhere you
  cannot take off from was permanent: ten hides and fourteen branches — the most
  expensive thing in the game by its own config comment — became scenery, because
  the only verb a glider had was *fly* and the answer was no. `E` on a wing that
  refuses now says **`shoulder the wing — <the refusal, in full>`**, and while it
  is on your shoulders the prompt becomes `set the wing down — ground that falls
  95% is 30 m straight ahead`. Played end to end: built on flat ground → refused
  → shouldered → **carried 26.8 m while the hint tracked me** (30 m ahead → 15 m
  ahead → 15 m 38° left) → `E run — 84% downhill ahead of you` → flew **90 m for
  17 m of drop** → landed → and the landing spot was flat, so it offered to
  shoulder it again. The trap is now a loop. Photographed:
  `shots/wing-carried.jpg`.
  - `nearestLaunchable` / `carryReport` are pure and live in `glider.js` with the
    rest of the model — no THREE, no DOM. **`npm run glidercheck` is 42/42** (was
    32), ten of them new and none needing a server.
  - Carrying costs you `GLIDER.carrySpeed` = 0.55 of your pace, outside survival
    too — it is the size of the object, not a hardship rule.
  - **A save taken while carrying sets it down first**, the same way `saveNow`
    already landed you before saving, and for the same reason: a wing on your
    shoulder is not in the structure list either. Verified — the wing is in the
    save file.
- **`STATE.md` no longer bounces a player to the menu.** It was the one root
  document the rules require every run to write and the one still missing from
  the Vite watcher's ignore list. One line in `vite.config.js:209`.
- **The wire says WHERE you are pointing** (`aimYaw`/`aimPitch`, absolute, not
  deltas) and **killing an animal leaves an animal behind** — the server rolls
  the carcass now instead of `onCreatureHit: () => {}`. Both landed at 17:00–17:01
  from the previous run; `shotcheck` 2/8 → 8/8, aim error 3.81° → 0.00°.
- **An agent's `gather` no longer walks to the same branch for ever.** The
  `taken` Set thread that sat uncommitted in `pickups.js` for two runs is
  finished and committed — `agent.js:125,460,545,553`. Nothing is uncommitted now.
- **Everybody is under the same sky, and the same clock, fire, warmth, health and
  position.** The six-for-six applyRemote family. `weathercheck` 27,
  `firecheck` 57, `warmthcheck` 20, `clockcheck` 21, `deathcheck` 19, `netcheck` 24.
- A companion bites for its owner; arrows hit players; wounds persist; standing
  orders are obeyed; `B` opens a build chooser; `E` obeys one distance rule.

**All suites green this run, on a quiet box:** `firecheck` 57,
`companioncheck` 45, **`glidercheck` 42**, `campcheck` 36, `weathercheck` 27,
`netcheck` 24, `mindcheck`/`clockcheck` 21, `warmthcheck` 20, `deathcheck` 19,
`bookcheck`/`reportcheck` 18, `ordercheck` 17, `dangercheck` 12,
`arrowcheck`/`woundcheck` 7. **`deathcheck`, `clockcheck`, `firecheck`,
`warmthcheck` and `weathercheck` are not in the standing check list in the run
instructions — run them anyway.** Only `netcheck` needs a server.

## The rules the last several runs came down to

- **Two copies of one number is the bug**, and the fix is always four pieces:
  `applyRemote`, a `remote` flag that stands aside *only the integration*, a
  `takeOverLocally`, and a guard that ignores a bad value rather than obeying it.
  **Stand aside as NARROWLY as you can** — everything upstream is local
  presentation and must keep running or the HUD stops explaining anything.
- **An accumulating value cannot cross a rate-limited channel.** Look deltas at
  60 Hz down a 30 Hz wire lost half of every turn. Found three times now
  (`lightFire`, `syncCompanion`, aim) and patched locally twice. Send the
  ABSOLUTE and set from it.
- **A refusal that carries what it measured stops being a wall.** `launchRefusal`
  already said the slope it got, the slope it needed and which way to turn; this
  run gave it a verb to go with it. If you are about to write a message that only
  says no, ask what the code already knows.

## Things that will waste your time if you do not know them

- **`highlands.capture()` RUNS A FRAME.** Anything the sim writes every tick —
  a carried wing's transform, a position, a rotation — is overwritten between
  your console assignment and the shot, and three captures with three different
  values came back byte-identical. **Tune in the source, not the console.**
- **`ctrl.yaw = x` IS THE SAME TRAP AS `ctrl.position.set` AND `warp`.** The
  intent carries look as DELTAS, so a hand-assigned yaw is invisible to the
  server. Cost 83.67 m of split once. Re-align with `ctrl.position.set(...snap.me.p)`
  and print the split before believing anything positional.
- **Sandbox pins `feltC`/`effectiveC`/`wetness` while `coreC` keeps falling** —
  the local thermal model is frozen by `ruleset.current.survival === false`. Looks
  exactly like a new fix failing to reach the body. Set it true in place.
- **`highlands.build()` takes NO argument** — it builds the best thing you can
  afford, so `build('glider')` cheerfully gives you a windbreak. To place a
  specific one: `structures.place('glider', x, z, yaw)`.
- **`netcheck` on a loaded box fails the COMPANION line too**, not just the
  budget line. Quieten the box and re-run before believing either failure.
- **`HOURS=1` MOVES THE SPAWN TO THE OTHER SIDE OF THE LAKE** (~420 m).
- **A number that reproduces exactly is a CONFIGURATION, not a drift.**
- **Stale processes: kill them at the END of your run, not just the start.** A
  backgrounded `server.js` can be reported EXITED while still listening;
  `netstat -ano | grep ":8080.*LISTENING"` is the fact. This run found one on
  **8099** left from an earlier session.
- **A KEY RELEASE YOU DO NOT STEP IS NEVER SENT.** After a keyup, keep stepping
  for at least `1000/NET.intentHz` ms of REAL time.
- **Keys must be dispatched on `window`, not `document`.**
- **Pace `stepWorld` to the WALL CLOCK for anything networked.**
- **The socket keeps delivering while `stepWorld` is not running.** Do the whole
  observation in one cell.
- **`javascript_tool` gives up at 30 SECONDS**, and `const` leaks between calls —
  wrap every call in `(async()=>{ ... })()`.
- **NEGATIVE `ctrl.pitch` LOOKS DOWN**, and pitch is damped back every step — set
  both. The player's yaw is the OPPOSITE convention to a companion's, and
  `flightHeading(yaw) = yaw + PI` is the seam between walking and flying.
- **Two check harnesses run back to back collide.** Re-run the loser on its own.
- **A fresh server does NOT clear the duplicate roster** — it is a name collision
  between the server's rival hunters and the `agents.js` pool.
- **`HOURS=1 RAID=6` are knobs on `server.js`.** Attach the witness before the
  fight; goblins cover 26 m in three seconds.
- **A long survival test measures FOOD, not what you think.** Pin `hunger`.
- **`highlands.report({steps})` wants an ARRAY.** `agentcheck` is 16/17, pre-existing.
- **The scatter collider field is `highlands.scatter.colliders`**; a creature's
  Object3D is `c.object`; lit fires are `highlands.fires.active`; `hud.heard`
  holds objects and is NOT an array — read `h.text`.

## The game queue, ranked

1. **Your food is still your own opinion, and the fix is NOT one line.** Blocked
   on #4: nothing can ever feed the server's copy of you. `intent.eat` is on the
   wire and no handler reads it, and the server's `p.inventory` is not your
   inventory — so reading `me.f` today means eating does nothing (overwritten
   ~5×/s). The route in is an `intent.eat` handler plus a server-side inventory.
   **This is NOT in the applyRemote family** — those four pieces will not fit.
2. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it. *(`nearestLaunchable` added this run uses the
   `(+sin, +cos)` convention and is consistent with `canLaunch`; the lift sampler
   is the one still in doubt.)*
3. **Arrows fired at ~0 m all miss.** Four full-charge shots at a motionless
   goblin standing on top of me did nothing. Unexamined — **and the aim fix at
   `f3cf877` may have changed it, so re-measure before theorising.**
4. Multiplayer carcass harvesting fills a LOCAL inventory only, and a mirrored
   animal's morale/`hurt` flags are never sent. **Half of this was done at
   `6cc22ff`** (the server rolls the carcass now); re-check what is left.
5. **Nothing else comes back DOWN about your own animal.** The fight does
   (`g` + `mirrorFight`); the server still cannot say the pet was hurt, fed by
   somebody else, or killed. `g` is the pattern to copy.
6. **Crouch is a uniform Y squash of the whole avatar** — a person of identical
   proportions, 72% as tall, nameplate and all. Reads as "the model glitched",
   which is the report we got. The fix is small and the parts exist: bend the
   legs (`parts.legs[i].rotation.x` is already driven) and drop `body.position.y`
   instead of scaling the group. `FINDINGS.md`, 2026-08-05 16:40.

**Unmeasured, worth one run:** with 4 players the server's population drifted
68 → 37 over ~24 game minutes (cap is 120, so not the cap), across 02:00–05:00.
Daybreak retiring the night shift would explain it; so would `clearedSites`
sterilising ground. Nobody tested which — do not repeat it as fact.

**Measured, not a regression, worth a decision:** a companion trails a
CONTINUOUSLY MOVING owner at about its own `runRange` — inside that range
`think` only walks it and every species walks slower than a person. Invisible in
single player because people stop constantly; glaring with agents, which never do.

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
