# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 13:15, by the session that gave the OWNER their animal's
fight back — and found the client's body 417 m from the server's copy of it.

## What works right now

- **A companion bites for its owner, everyone sees it — INCLUDING THE OWNER.**
  `npm run bitecheck` (**10/10**, spawns its own server) watches the whole thing
  from a second player's snapshot and then reads the owner's own stream for the
  quarry id; a browser has watched its own cub go for a goblin 0.4 m away and
  take it 34 → 19. The chain is live end to end: C_PET up, `setCompanionState`,
  `resolveAttack`, `defend`, `pendingBite`, snapshot out with `g`, `mirrorFight`
  on the owner's client.
- **Your animal comes with you onto a server, and so does everything about it.**
  The server keeps its own copy, walks it, and puts it in every snapshot — with
  the name it earned, the trust, the tricks it knows and the standing orders it
  is under. `guard` can finally be switched on from a real client.
- **You can fight a goblin in daylight.** It routs on sight, but now spends its
  breath doing it and goes to ground where you can reach it.
- **Everyone hunts the same animals**, arrows hit players, wounds persist, the
  cull is per-player, standing orders are obeyed. All suites green
  (`companioncheck` **45**, `campcheck` 36, `glidercheck` 32, `netcheck` **22**,
  `mindcheck` 21, `raidcheck`/`bookcheck`/`reportcheck` 18, `ordercheck` 17,
  `herdcheck`/`dangercheck`/`rendercheck` 12, `spreadcheck` 10, `shotcheck` 8,
  `arrowcheck`/`woundcheck` 7).
- The picture fits the window at any scaling; a fire can be seen and heard; the
  arrow's predicted impact is within 1–2 cm of a loosed one; the glider flies
  where you look; the client reads world events; chat is a column on the right;
  `B` opens a build chooser; `E` obeys one distance rule and always answers.

## Recently closed — details in `FINDINGS.md` under the dated heading

- **"The owner is the one person who cannot see their own animal fight"** (13:15),
  queue #1. The snapshot's own `co` entry now carries **`g`**, the creature id its
  animal is fighting, sent only while there is a fight; the owner's client looks
  that mirrored body up in `wildlife.byServerId` and hands it to the real pet via
  the new **`Companion.mirrorFight`**. Watched live: server said `attack` on goblin
  #16 at 3.08 s, the LOCAL cub was in `attack` on the same mirrored goblin, 2.74 m
  away closing to 0.40 m, toast "Fang goes for the goblin", target 34 → 19 hp.
  Three things to carry forward:
  - **`defend` cannot be the line that does this.** It is a DECISION and it
    refuses on trust and standing orders — questions the server has already
    answered against the same digest. Asking twice can only disagree, and the
    disagreement IS this bug. `mirrorFight` delivers the outcome instead.
  - **Local bite damage is suppressed while connected.** The server resolved the
    bite; `c.hp = e.h` overwrites the local number a frame later anyway, and
    applying it here could bury a goblin the server still has standing.
  - **`mirrorFight` refuses a quarry beyond `giveUpRange`** — see the 417 m
    finding below, which is what made that necessary.
- **"Nobody has SEEN a companion bite over the wire"** (12:35), earlier queue #1.
  Watched from a second player's stream, twice, agreeing to the tenth of a second.
  Two things worth carrying forward:
  - **`HOURS=1 RAID=6` are knobs on `server.js`**, off by default, changing
    nothing when off. They stage the night and the warband, because goblins are
    night-only, a day is 26 real minutes, and a goblin arriving ALONE has morale
    0.00 and runs — so a real fight costs more to wait for than to test.
  - **Attach the witness before you start the fight.** The goblins cover 26 m and
    draw blood in three seconds; an observer that goes on late finds the evidence
    already spent, and reports the harness's fault as the game's.
- **"A companion's relationship does not cross the wire"** (12:05). `C_PET` carries
  the digest up. Four facts from it that still bite:
  - **The rounding IS the rate limiter** — quantised to 2 dp, so a resting
    animal sends nothing and a decaying one about a packet a second. No timer.
  - **The server's copy is `mirrored`**, a flag that makes it heel regardless of
    trust: two untamed copies wandering on two machines diverge without limit.
    The trust is still real and `defend` still refuses on it — that is the gate.
  - **`giveCompanion`'s trust 0.6 is a placeholder**, overwritten by the owner's
    first packet, kept for ever only by agents, which never send one.
  - **Your own animal IS in your own snapshot**, unlike `pl`; the browser skips
    its own by owner id — and now reads its own entry for the fight.
- **Goblins unkillable in daylight** (10:45), **window resize wrecking the sim**
  (10:15), **both fire bugs** (09:35, 09:50). The lesson that outlived them:
  **check the symptom still stands, and check which game mode a number came
  from, before you hunt a cause.**

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
- **NEVER believe a distance in multiplayer without comparing both bodies
  first.** `Math.hypot(snapshotCreature.p − highlands.ctrl.position)` is a
  distance between two different coordinate origins while queue #1 stands: it
  was 417 m wrong. Print `highlands.ctrl.position` next to `snap.me.p` in the
  same line before you use either. Aligning them by hand
  (`h.ctrl.position.set(...snap.me.p)`) is a valid way to test anything
  positional — it is LOCAL, so the server never hears it, but it puts your
  camera where the fight is.
- **A goblin on 4 hp standing 0.1 m away does not swing.** Two survivors sat in
  `alert` at arm's length for 25 s of stepping and never attacked, so no
  `resolveAttack`, so nothing for a companion to answer. If you need a fight,
  restart the server for a fresh `RAID` — do not wait on wounded ones.
- **The client draws its own daylight.** Server clock 04:13, screen broad
  daylight, twice now (12:25 and 13:00). The snapshot carries `c`; whether the
  client applies it is STILL unchecked. Do not repeat a cause, there isn't one yet.
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

1. **YOUR BODY IS NOT WHERE THE SERVER THINKS IT IS — 417 m out, measured
   twice.** In a browser joined to :8080, `highlands.ctrl.position` read
   (−27.8, 82.1) while the same packet's `me.p` read (279.2, −198.6). Same
   numbers on a fresh server and a fresh page, so it is deterministic, not drift.
   Everything positional in multiplayer is downstream of this: the warband
   staged "26 m from Claude" was 417 m from the Claude on screen, the goblins
   that killed me were never visible, and the first honest version of the
   companion fix produced five toasts about a fight over the horizon.
   `snapshot()` says out loud that a browser ignores `me` and keeps its own —
   correct for a body integrating its own intents, fiction if the two ever
   started somewhere different. **Nobody has checked what the server does with a
   joining client's spawn point.** Start there, and print both positions in the
   first snapshot before theorising. Queue #2 below is the same bug wearing a
   health bar.
2. **The server killed me and respawned me and the browser never noticed.** The
   snapshot's `me.h` ran 12 → 0 → 89 → 34 → 1 → 0 → 100 while the local health
   bar read 100 throughout — watched again at 13:00, 100 → 0 → 100 with the bar
   flat at 100. Same family as #1: a browser keeps its own `me`.
3. **A stranded glider cannot be recovered.**
4. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it.
5. **Arrows fired at ~0 m all miss.** Four full-charge shots at a motionless
   goblin standing on top of me did nothing. Same family as the
   axe-misses-in-a-swarm note, probably. Unexamined.
6. Multiplayer carcass harvesting fills a LOCAL inventory only, and a mirrored
   animal's morale/`hurt` flags are never sent. Small and deliberate, for now.
7. **Nothing else comes back DOWN about your own animal.** The FIGHT now does
   (`g` + `mirrorFight`). The owner is still the authority on the relationship,
   which is right, but the server cannot say the pet was hurt, fed by somebody
   else, or killed — and `g` is the pattern to copy when it should.

**Measured 11:40, not a regression, worth a decision:** a companion trails a
CONTINUOUSLY MOVING owner at about its own `runRange` — inside that range
`think` only walks it and every species walks slower than a person. Morag's
hippo sat 21.9 m behind her (`runRange` 22). Invisible in single player because
people stop constantly; glaring with agents, which never do.

**One of the two unexplained 12:25 readings now has a cause: queue #1.** The
LOCAL cub reading 341.6 m away is the client/server body split — the animal was
next to one of the two bodies. The other (the client drawing midday at server
01:00) is still open and is now in the time-wasters list.

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
