# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 13:40, by the session that closed the 417 m — which was
a staging flag and two small bugs, and never once was drift.

## What works right now

- **Your body is where the server says it is.** 0.00 m apart on both join paths,
  yaw agreeing. `netcheck` (**24/24**) guards it from both ends and those two
  guards were watched failing on the old code at 4.10 m and 3.31 m. A staged
  warband is finally VISIBLE: five goblins in `attack` at 0.45–1.64 m.
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
  (`companioncheck` **45**, `campcheck` 36, `glidercheck` 32, `netcheck` **24**,
  `mindcheck` 21, `raidcheck`/`bookcheck`/`reportcheck` 18, `ordercheck` 17,
  `herdcheck`/`dangercheck`/`rendercheck` 12, `spreadcheck` 10, `shotcheck` 8,
  `arrowcheck`/`woundcheck` 7).
- The picture fits the window at any scaling; a fire can be seen and heard; the
  arrow's predicted impact is within 1–2 cm of a loosed one; the glider flies
  where you look; the client reads world events; chat is a column on the right;
  `B` opens a build chooser; `E` obeys one distance rule and always answers.

## Recently closed — details in `FINDINGS.md` under the dated heading

- **"YOUR BODY IS NOT WHERE THE SERVER THINKS IT IS — 417 m"** (13:40), queue #1,
  open four sessions. It was three things and none of them was drift:
  - **The 417 m itself was `HOURS=1`.** `pickSpawn` stands you on the shore
    OPPOSITE THE SUN, by design. The client runs it against its own clock, the
    server against the server's — so a night-staged server and a client drawing
    its own morning choose opposite shores of a 235 m-radius lake. Reproduced
    the old figures to the centimetre: (−27.81, 82.07) vs (279.22, −198.56),
    415.96 m. On a default 07:00 server the same page reads 3.31 m.
  - **`highlands.join()` never took the server's spawn.** The handler block was
    written twice and the console copy only toasted — no `teleport`. One
    `netHandlers()` now, used by both `?join=` and `join()`.
  - **`hello()` sent the world's base spawn**, not the spot `addPlayer` actually
    put you on, so every arrival after the first began life a fixed distance
    beside itself — 3.31 m for the second, 4.10 m for the third, growing.
  Carry forward: **queue #2 is not the same bug.** With position shared, server
  `me.h` read 89 while the local bar read 100 in the same instant.
- **"The owner is the one person who cannot see their own animal fight"** (13:15),
  earlier queue #1. The snapshot's own `co` entry now carries **`g`**, the
  creature id its animal is fighting, sent only while there is a fight; the
  owner's client looks that mirrored body up in `wildlife.byServerId` and hands
  it to the real pet via the new **`Companion.mirrorFight`**. Two things to
  carry forward:
  - **`defend` cannot be the line that does this.** It is a DECISION and it
    refuses on trust and standing orders — questions the server has already
    answered against the same digest. Asking twice can only disagree, and the
    disagreement IS this bug. `mirrorFight` delivers the outcome instead.
  - **Local bite damage is suppressed while connected**, and `mirrorFight`
    refuses a quarry beyond `giveUpRange` — a guard added for the 417 m split,
    harmless now that the two bodies agree, and worth keeping.
- **"Nobody has SEEN a companion bite over the wire"** (12:35), **"a companion's
  relationship does not cross the wire"** (12:05), **goblins unkillable in
  daylight** (10:45), **window resize wrecking the sim** (10:15), **both fire
  bugs** (09:35, 09:50). All in `FINDINGS.md`. The facts from them that still
  bite, kept because they are still load-bearing:
  - **`HOURS=1 RAID=6` are knobs on `server.js`**, off by default, changing
    nothing when off. Goblins are night-only, a day is 26 real minutes, and a
    lone goblin has morale 0.00 and runs — waiting for a real fight costs more
    than staging one. **But `HOURS` moves the spawn — see the list below.**
  - **Attach the witness before you start the fight.** The goblins cover 26 m and
    draw blood in three seconds; an observer that goes on late finds the evidence
    already spent, and reports the harness's fault as the game's.
  - **The rounding IS the rate limiter** for `C_PET` — quantised to 2 dp, so a
    resting animal sends nothing and a decaying one about a packet a second.
  - **The server's copy of a pet is `mirrored`**, which makes it heel regardless
    of trust; `giveCompanion`'s trust 0.6 is a placeholder the owner's first
    packet overwrites, kept for ever only by agents, which never send one.
  - **Your own animal IS in your own snapshot**, unlike `pl`; the browser skips
    its own by owner id — and now reads its own entry for the fight.
  - **Check the symptom still stands, and which game mode a number came from,
    before you hunt a cause.**

## Things that will waste your time if you do not know them

- **`HOURS=1` MOVES THE SPAWN TO THE OTHER SIDE OF THE LAKE.** `pickSpawn`
  stands you on the shore opposite the sun, so the world's spawn point is a
  function of the hour you start at — the staging flag does not just change the
  light, it relocates everybody by up to ~420 m. Harmless now that clients take
  the server's spawn, but any measurement that compares a staged server against
  an unstaged one, or against a client's own `highlands.spawn`, is comparing two
  different places. It cost four sessions once already.
- **A number that reproduces exactly is a CONFIGURATION, not a drift.** 417 m,
  twice, "deterministic, so not drift" — and the determinism was the clue that
  it was an input, not an accumulation. Ask what was different about the
  *launch* before you go looking for a leak.
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
- **Still print both bodies on one line before believing a distance.** The two
  origins agree now (0.00 m), and one line of output is what proved it — and
  what would have saved four sessions if anyone had printed it sooner. Aligning
  them by hand
  (`h.ctrl.position.set(...snap.me.p)`) is a valid way to test anything
  positional — it is LOCAL, so the server never hears it, but it puts your
  camera where the fight is.
- **A goblin on 4 hp standing 0.1 m away does not swing.** Two survivors sat in
  `alert` at arm's length for 25 s of stepping and never attacked, so no
  `resolveAttack`, so nothing for a companion to answer. If you need a fight,
  restart the server for a fresh `RAID` — do not wait on wounded ones.
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

1. **The server killed me and respawned me and the browser never noticed.** The
   snapshot's `me.h` ran 12 → 0 → 89 → 34 → 1 → 0 → 100 while the local health
   bar read 100 throughout — watched again at 13:35, server 89 against a local
   100 in the same instant. **This is now its OWN bug**: it used to be waved at
   as "same family as the position split", and the position split is closed
   while this stands unchanged. The client applying `me.h` while connected is
   the obvious shape, and nobody has checked what that does to the death and
   respawn path, which is local-only today.
2. **The client draws its own daylight.** Broad daylight at server clock 01:00,
   three times now (12:25, 13:00, 13:35). The snapshot carries `c` and nothing
   applies it — the same root as the old 417 m, and now the only symptom of it
   left. Promoted out of the time-wasters list because it is a real bug and it
   is small: one number, arriving 20 times a second, that nothing reads.
3. **A stranded glider cannot be recovered.**
4. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it.
5. **Arrows fired at ~0 m all miss.** Four full-charge shots at a motionless
   goblin standing on top of me did nothing. Same family as the
   axe-misses-in-a-swarm note, probably. Unexamined. Worth retrying now that a
   goblin on screen is genuinely the goblin the server is holding.
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

**Both unexplained 12:25 readings now have causes.** The LOCAL cub reading
341.6 m away was the client/server body split, now closed. The other — the
client drawing midday at server 01:00 — is queue #2 above, and is the last
surviving piece of the same root: the client never reads the server's clock.

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

*(This file is ~260 lines, not the 100 it asks for, and the previous note here
said "~150" when it was already 252 — so do not trust that estimate, run
`wc -l`. The overflow is nearly all in "things that will waste your time":
every line there is a measured fact that cost a run to learn, and deleting them
to hit a count would cost the next session more than the reading does. Cut the
closed-work section first — it was cut hard this run and can be cut again, since
all of it is in `FINDINGS.md` under its dated heading.)*

## The trap this project falls into

**A name used and never defined** — `clamp`/`damp`, `vitals.hurt`,
`appendFileSync`, `amountText`, `SPECIES`, `audio.fireLit`. Invisible to build;
only found by running the line. Grep every identifier your new code uses.
**And a clean build proves nothing.** Verify by driving the game.
