# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 11:45, by the session that put companions in multiplayer.

## What works right now

- **Your animal comes with you onto a server, and other people can see it.**
  The server keeps its own copy, walks it, and puts it in every snapshot.
- **You can fight a goblin in daylight.** It routs on sight as before, but it
  now spends its breath doing it and then goes to ground where you can reach it.
- **Everyone hunts the same animals**, arrows hit players, wounds persist, the
  cull is per-player, standing orders are obeyed. All suites green
  (`campcheck` 36, `glidercheck` 32, `companioncheck` 29, `mindcheck` 21,
  `raidcheck`/`bookcheck`/`reportcheck` 18, `ordercheck` 17, `netcheck` **16**,
  `herdcheck`/`dangercheck`/`rendercheck` 12, `spreadcheck` 10, `shotcheck` 8,
  `arrowcheck`/`woundcheck` 7).
- The picture fits the window at any scaling; a fire can be seen and heard; the
  arrow's predicted impact is within 1–2 cm of a loosed one; the glider flies
  where you look; the client reads world events; chat is a column on the right;
  `B` opens a build chooser; `E` obeys one distance rule and always answers.

## Recently closed — details in `FINDINGS.md` under the dated heading

- **"Companions do not exist in multiplayer"** (11:45), queue #1. `SimWorld` now
  owns a `Companion` per player: `C_HELLO` carries `pet`, `giveCompanion` makes
  the server's copy, `stepCompanion` walks it, `snapshot().co` carries it to
  everybody, and `src/net/petavatars.js` draws other people's (a real
  `Companion` with `think`/`move` never called, so `animate` works off the wire).
  Two things a future session will otherwise trip on: **your own animal IS in
  your own snapshot**, unlike `pl` — a watcher with no local pet would otherwise
  be missing exactly the one it brought, so the browser skips its own by owner
  id; and the server's copy **arrives already tame**, because below `tame` the
  brain wanders and it would trot off in front of the whole server while your
  real one heeled. Trust, tricks and feeding stay owner-local — see queue #1.
  By `netcheck`, now **16**, four of them new.
- **"Goblins are unkillable in daylight"** (10:45). The broken branch of
  `thinkPack` was the only flight in `creature.js` that never spent stamina, so
  it held `flee` 7.6 m/s for ever. Now it tires and a blown one goes to ground
  in daylight (`goneToGround`). Night untouched. By `raidcheck`.
- **Window resize wrecking the sim** (10:15) and **both fire bugs** (09:35,
  09:50). By `rendercheck` and `campcheck`.

**Two lessons worth keeping, both about trusting a queue entry's own words.**
The resize entry inherited a RETRACTED symptom as its title: **check the symptom
still stands before you hunt its cause.** The goblin entry carried a number
measured in the wrong game mode that pointed the opposite way: **check which
mode a number came from** — Sandbox has no hunger, no stamina, no thirst.

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
- **`warp` is LOCAL, and it does not cancel a glide.** `updateFlight` rewrites
  `ctrl.position` every step, so step until `highlands.flight` is falsy before
  measuring. It is refused in Survival (it *returns* the refusal as a string),
  and the server never hears it — after one, your server body is where you left
  it. Fine for looking at things, worthless for anything the server must agree
  about.
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
- **`const` in the browser console leaks into global scope between calls**, so a
  second `javascript_tool` call reusing the same name dies on "Identifier 'g'
  has already been declared". Wrap every one in `(async()=>{ ... })()`.

## The game queue, ranked

1. **A companion's RELATIONSHIP does not cross the wire.** The body does now;
   the trust, the tricks and the standing orders do not, so the server's copy is
   permanently at trust 0.6 with no tricks and `guard` off. Feeding and training
   still happen only on the owner's machine. `defend` and the bite are wired and
   waiting on a `guard` toggle nothing can currently set over the wire.
2. **A stranded glider cannot be recovered.**
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it.
4. **Arrows fired at ~0 m all miss.** Four full-charge shots at a motionless
   goblin standing on top of me did nothing. Probably the same family as the
   axe-misses-in-a-swarm note. Unexamined.
5. Multiplayer carcass harvesting fills a LOCAL inventory only, and a mirrored
   animal's morale/`hurt` flags are never sent. Small and deliberate, for now.

**Measured 11:40, not a regression, worth a decision:** a companion trails a
CONTINUOUSLY MOVING owner at about its own `runRange` — inside that range
`think` only walks it (`d > runRange ? runSpeed : walkSpeed`) and every species
walks slower than a person. Morag's hippo sat 21.9 m behind her (`runRange` 22).
This is the single-player tuning untouched; it is invisible there because people
stop constantly and glaring with agents, which never do.

**Unmeasured, worth one run:** with 4 players the server's population drifted
68 → 37 over ~24 game minutes (cap is 120, so not the cap), across 02:00–05:00.
Daybreak retiring the night shift would explain it; so would `clearedSites`
sterilising ground. Nobody tested which — do not repeat it as fact.

## How to play it

```
npx vite --port 5173 --strictPort
DANGER=no-bears node server/server.js 8080
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
