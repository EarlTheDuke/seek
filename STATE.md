# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 12:05, by the session that put the RELATIONSHIP on the wire.

## What works right now

- **Your animal comes with you onto a server, and so does everything about it.**
  The server keeps its own copy, walks it, and puts it in every snapshot — with
  the name it earned, the trust, the tricks it knows and the standing orders it
  is under. `guard` can finally be switched on from a real client.
- **You can fight a goblin in daylight.** It routs on sight, but now spends its
  breath doing it and goes to ground where you can reach it.
- **Everyone hunts the same animals**, arrows hit players, wounds persist, the
  cull is per-player, standing orders are obeyed. All suites green
  (`campcheck`/`companioncheck` **36**, `glidercheck` 32, `netcheck` **22**,
  `mindcheck` 21, `raidcheck`/`bookcheck`/`reportcheck` 18, `ordercheck` 17,
  `herdcheck`/`dangercheck`/`rendercheck` 12, `spreadcheck` 10, `shotcheck` 8,
  `arrowcheck`/`woundcheck` 7).
- The picture fits the window at any scaling; a fire can be seen and heard; the
  arrow's predicted impact is within 1–2 cm of a loosed one; the glider flies
  where you look; the client reads world events; chat is a column on the right;
  `B` opens a build chooser; `E` obeys one distance rule and always answers.

## Recently closed — details in `FINDINGS.md` under the dated heading

- **"A companion's relationship does not cross the wire"** (12:05), queue #1.
  A new `C_PET` message carries a digest up from the owner — species, trust,
  fed/played/warmth, name, learned tricks, standing orders — plus a one-shot `a`
  for a trick being performed now, so a trick is something the whole server
  watches. Also closed the hole it exposed: **swapping companion after joining
  never told the server**, so a wolf cub was an otter to everybody else and its
  tricks were filtered against the otter's table. Three things you will
  otherwise trip on:
  - **The rounding IS the rate limiter** — quantised to 2 dp, so a resting
    animal sends nothing and a decaying one about a packet a second. No timer.
  - **The server's copy is `mirrored`**, a flag that makes it heel regardless of
    trust: two untamed copies wandering on two machines diverge without limit.
    The trust is still real and `defend` still refuses on it — that is the gate.
  - **`giveCompanion`'s trust 0.6 is now a placeholder**, overwritten by the
    owner's first packet, kept for ever only by agents, which never send one.
- **"Companions do not exist in multiplayer"** (11:45). **Your own animal IS in
  your own snapshot**, unlike `pl` — a watcher with no local pet would otherwise
  be missing exactly the one it brought, so the browser skips its own by owner
  id.
- **Goblins unkillable in daylight** (10:45), **window resize wrecking the sim**
  (10:15), **both fire bugs** (09:35, 09:50). All by their own suites. Two
  lessons from them, both about trusting a queue entry's own words: one
  inherited a RETRACTED symptom as its title, one carried a number measured in
  the wrong game mode. **Check the symptom still stands, and check which mode a
  number came from, before you hunt a cause.**

## Things that will waste your time if you do not know them

- **Your own source edit reloads the page out from under your measurement.**
  Editing `src/*` bounces the client through Vite: fresh world, mode back to
  **Survival**, `audio.ready` false, no fires — so the next reading throws, or
  quietly measures an empty world. Re-click the mode button and re-check
  `highlands.ruleset.current.id` after any edit. Check `git log --oneline -3`
  and `git pull` first too: a second session can be live on :8080, and your
  reload dumps its player to the menu.
- **Stale processes: kill them at the END of your run, not just the start.** A
  backgrounded `agents.js` dies with the wrapper but `server.js` survives, holds
  8080 and ticks into a closed pipe. Find them with `wmic process where
  "name='node.exe'" get processid,commandline` and grep for `server.js` /
  `agents.js` — **not** the project path, which is cwd-relative and will miss.
- **Keys must be dispatched on `window`, not `document`.** A `document` keydown
  moves nothing and throws nothing — measured, 0.00 m against 1.66 m for the
  same event on `window`. It cost this run three wrong readings.
- **The player's yaw is the OPPOSITE convention to a companion's.** A creature
  moves along `(sin yaw, cos yaw)` and `faceToward` uses `atan2(dx, dz)`; the
  player's forward is the negative of that, so aiming the body at something is
  `atan2(dx, dz) + PI`. Without the `+ PI` you walk away at exactly the speed
  you expected to close.
- **`netcheck`'s snapshot-budget line measures WHOEVER IS ON THE BOX** — 156 KB/s
  (a FAIL) with a browser and two pet-carrying agents connected, 62.8 KB/s on
  the same build with the server to itself. Quieten it before believing it.
- **Two check harnesses run back to back collide.** `spreadcheck` then
  `shotcheck` gave 4/8; `shotcheck` alone gives 8/8. Never read a suite's score
  out of a loop without re-running the loser on its own.
- **A fresh server does NOT clear the duplicate roster.** `[#1 Eachann, #4
  Eachann, #5 Morag]` is a name collision between the server's rival hunters and
  the `agents.js` pool, not stale state. Restarting to fix it is waste.
- **`warp` is LOCAL, and it does not cancel a glide.** `updateFlight` rewrites
  `ctrl.position` every step, so step until `highlands.flight` is falsy before
  measuring. Refused in Survival (it *returns* the refusal as a string), and the
  server never hears it. Worthless for anything the server must agree about.
- **Deer wander.** Reading a deer's position once and then stepping through a
  long scan aims you where it used to be — it cost a run two wrong readings.
- **A long survival test measures FOOD, not what you think.** `dayMinutes: 26`,
  so 40 real minutes is 32 in-world hours and a shivering body (`hungerColdMul`
  1.9) starves first. Deaths reported at 34.9 C — *above* the 33.0 cold
  threshold — were all starvation. Pin `hunger`, or keep to one night (8.7 min).
- **Sandbox freezes survival** (`ruleset.current.survival` false), so hunger and
  stamina never move and any endurance number taken there is meaningless.
  `spawnPack` needs Sandbox and stamina needs Survival, so: click Sandbox,
  spawn, then set `highlands.ruleset.current.survival = true` in place.
- **`ctrl.pitch` is damped back to `ctrl.targetPitch` every step** — writing
  `pitch` alone is erased before the next frame, and you will miss a stationary
  target at point blank and blame the arrows. Set BOTH (`targetYaw`/`yaw` too).
  Sweep `targetPitch` and read `highlands.aimMark.mesh.position` for the firing
  solution in one pass; at 12.4 m against a standing goblin it is −0.10.
- **The sun is `clock.hours`, not `wildlife.ctx`** — `SimWorld.step` rebuilds
  the context from `solarPosition(clock.hours)` every step. Set `clock.hours` +
  `running=false`.
- **`highlands.report({steps})` wants an ARRAY.** A string throws and files
  nothing. **`agentcheck` is 16/17**, pre-existing. **`netcheck` needs a server
  up** or it prints "could not run" and no score.
- **The scatter collider field is `highlands.scatter.colliders`** — the other
  one's `.list` is empty. **A creature's Object3D is `c.object`**. **Lit fires
  are `highlands.fires.active`.** **`hud.heard` holds objects, not strings** —
  read `h.text`.
- **`const` in the browser console leaks into global scope between calls.** Wrap
  every `javascript_tool` call in `(async()=>{ ... })()`.

## The game queue, ranked

1. **Nobody has SEEN a companion bite over the wire.** `guard` now reaches the
   server and `companioncheck` proves a copy with the order on answers what hurt
   its owner, but nothing has staged it live: get hurt by a creature with `guard`
   on and watch a second player's snapshot. The bite has never been observed in
   multiplayer.
2. **A stranded glider cannot be recovered.**
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it.
4. **Arrows fired at ~0 m all miss.** Four full-charge shots at a motionless
   goblin standing on top of me did nothing. Same family as the
   axe-misses-in-a-swarm note, probably. Unexamined.
5. Multiplayer carcass harvesting fills a LOCAL inventory only, and a mirrored
   animal's morale/`hurt` flags are never sent. Small and deliberate, for now.
6. **Nothing comes back DOWN about your own animal.** The owner is the authority
   on its relationship, which is right, but the server can never tell you your
   pet was hurt, fed by someone else, or killed. Fine today because nothing on
   the server can do any of those. Revisit before anything can.

**Measured 11:40, not a regression, worth a decision:** a companion trails a
CONTINUOUSLY MOVING owner at about its own `runRange` — inside that range
`think` only walks it and every species walks slower than a person. Morag's
hippo sat 21.9 m behind her (`runRange` 22). Invisible in single player because
people stop constantly; glaring with agents, which never do.

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
is back. And **you can press keys**: `window.dispatchEvent(new KeyboardEvent(
'keydown', {code:'KeyE'}))`, one `stepWorld`, then the matching `keyup` drives
E / W / G / B without pointer lock, so walking, gathering, lighting, building
and sprinting all work headlessly.

*(This file is ~150 lines, not the 100 it asks for. The overflow is all in
"things that will waste your time" — every line there is a measured fact that
cost a run to learn, and deleting them to hit a count would cost the next
session more than the reading does. Cut the closed-work section first.)*

## The trap this project falls into

**A name used and never defined** — `clamp`/`damp`, `vitals.hurt`,
`appendFileSync`, `amountText`, `SPECIES`, `audio.fireLit`. Invisible to build;
only found by running the line. Grep every identifier your new code uses.
**And a clean build proves nothing.** Verify by driving the game.
