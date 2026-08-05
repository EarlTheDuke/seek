# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 15:45, by the session that closed queue #1 — a fire is
now one fire, in one world, that everybody can see, feel and feed.

## What works right now

- **EVERYBODY SEES THE SAME FIRE, AND IT WARMS THEM.** The snapshot carries `fi`
  (position + fuel; no height, the client has the same terrain from the same
  seed) and `Fires.applyRemote` mirrors it, delivered RAW from `onSnapshot` like
  `me.h` and `snap.c`. Watched in a browser with a second player on a real
  socket: their fire on my screen 6.68 m away one packet after they lit it,
  fuel counting down on the server's clock; standing 3 m from it, `fireWarmth`
  **5.46 °C** and `effectiveC` 22.98 → **28.14**, against 0.00 forty metres away
  in the same minute. Photographed: `shots/someone-elses-fire.jpg`. My own fire
  is drawn the same frame as `pending`, appears in `snap.fi`, and is adopted
  (`pending: false`) two packets later. **The fuel clock stands aside while
  remote** — one authority — and the flicker, the light and the crackle stay
  local because nobody else has to agree with them. `npm run firecheck`
  (**57/57**, needs no server) drives both ends for real.
- **FEEDING A FIRE GOES UP THE WIRE**, and had to: once the server owns the
  fuel, `addFuel` in the browser is a number the next snapshot overwrites five
  times a second. A `C_FIRE` claim that lands ON a fire (within the same 3 m
  placement radius) is FUEL for it, one packet doing both, because from the
  player's end lighting and feeding are one sentence. Watched: server fuel
  19 → 63, one branch spent, client's number equal to the server's.
- **THE FIRE YOU LIGHT REACHES THE SERVER.** `C_FIRE` carries it up as ONE
  packet at the moment it catches (not through `intent.place` — a one-frame edge
  against a rate-limited send, so it is dropped or repeated). The client is
  believed about the WOOD (it is yours and already spent); the world is the
  authority on the GROUND.
- **It is the same time of day for everybody.** The snapshot's hour (`c`) has
  been sent since there have been snapshots and nothing ever read it; now
  `Atmosphere.applyRemote` takes it and the local clock stands aside while
  `remote` is set. Watched agreeing to 3 dp on every sample across six seconds
  against a server staged at 01:00, sun −9.6°, daylight 0.000 — where the same
  client used to draw a blue midday sky. `npm run clockcheck` (**21/21**, new,
  needs no server) drives BOTH ends for real: `SimWorld` for the sending end and
  the actual `Atmosphere` class for the receiving one, which builds its scene
  graph without a GL context. The sun, the fog, the stars, the exposure and every
  wildlife rule keyed off the sun all follow it.
- **Your health is the server's health.** The bar empties as the goblins take it
  off you, stays up while you are dead and refills when you stand — watched, on
  screen, `#hl-health` 89% → 0% → hidden → 89%. Before this the browser read 100
  through two deaths. `npm run deathcheck` (**19/19**, new) guards it from both
  ends and needs no server. Death lasts what the config says (3.42 s against a
  configured 3.4, was 1.6) and **you wake on the shore, not where you fell**.
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
  (`firecheck` **57**, `companioncheck` 45, `campcheck` 36, `glidercheck` 32,
  `netcheck` 24, `mindcheck`/`clockcheck` 21, `deathcheck` 19,
  `raidcheck`/`bookcheck`/`reportcheck` 18, `ordercheck` 17,
  `herdcheck`/`dangercheck`/`rendercheck` 12, `spreadcheck` 10, `shotcheck` 8,
  `arrowcheck`/`woundcheck` 7). **`deathcheck`, `clockcheck` and `firecheck` are
  still not in the standing check list in this file's own instructions — run
  them anyway.** None of the three needs a server.
- The picture fits the window at any scaling; a fire can be seen and heard; the
  arrow's predicted impact is within 1–2 cm of a loosed one; the glider flies
  where you look; the client reads world events; chat is a column on the right;
  `B` opens a build chooser; `E` obeys one distance rule and always answers.

## Recently closed — details in `FINDINGS.md` under the dated heading

- **"NOBODY COULD SEE ANYBODY ELSE'S FIRE"** (15:40). Queue #1, closed both
  directions. Carry forward, all three still load-bearing:
  - **Reconciled by POSITION, not by id.** The server's fire ids are built from
    a rounded position and the length of its own list, so they are not stable
    across two worlds and matching on them would spawn a duplicate every packet.
    1.5 m is unambiguous **because placement already refuses any fire within 3 m
    of another** — if that 3 m rule ever changes, `REMOTE_MATCH` changes with it.
  - **A fire you light is `pending` for `REMOTE_GRACE` 2.5 s.** Drawn instantly,
    swept away if the server never lists it — which it genuinely does refuse,
    because it can see somebody else's fire 2 m away that your browser cannot.
  - **Owning a number on the server breaks whatever wrote it locally.** The fuel
    was the case in point: feeding a fire would have silently done nothing. When
    you make the server the authority on something, grep for every local writer
    of it before you call the fix done.
- **"THE FIX IS ONE LINE" WAS WRONG** (14:55), and the line would have starved
  everybody. Queue #1 said food and core temperature were one line beside
  `vitals.applyRemote(snap.me.h)`. Measured, it is not: the server's copy of you
  has never had a fire and can never be fed. The fire half is now done both
  ways, so **`me.c` is unblocked**; `me.f` is still blocked on the old #6.
- **"THE CLIENT DREW ITS OWN DAYLIGHT"** (15:00). The browser never read
  `snap.c`, so it ticked the clock it booted with for ever. Fixed like the health
  and the position: `applyRemote`, a `remote` flag, `takeOverLocally`. Carry
  forward: **delivered RAW from `onSnapshot`, not through the interpolator** —
  the buffer is for smoothing BODIES, and an hour that arrives 110 ms late is
  still the right hour. Same call, same reason, as `me.h` and the events, **and
  the same rule for the fires that go down next.**
- **"THE SERVER KILLED ME AND RESPAWNED ME AND THE BROWSER NEVER NOTICED"**
  (14:20). Nothing read `me.h`; `stepPlayer` ticked the body TWICE per step; the
  server revived you where you fell. Carry forward: **a bare `Body.update` runs
  the whole of `Vitals.update`**, which is what made the duplicate invisible; and
  **the client's respawn must never use its own `spawn`** — it teleports to
  `me.p`, because on a `HOURS=1` server its own shore is the far side of the lake.
- **"YOUR BODY IS NOT WHERE THE SERVER THINKS IT IS — 417 m"** (13:40),
  **"the owner cannot see their own animal fight"** (13:15), **the companion bite
  over the wire** (12:35), **the relationship over the wire** (12:05), **goblins
  unkillable in daylight** (10:45), **window resize wrecking the sim** (10:15),
  **both fire bugs** (09:35, 09:50). All in `FINDINGS.md` under their dated
  headings. The facts from them that still bite, kept because they are still
  load-bearing:
  - **Do not ask a question the server has already answered.** `defend` refuses
    on trust and standing orders — the server checked both against the same
    digest — so the owner's client takes the OUTCOME (`mirrorFight`) rather than
    re-deciding. `Vitals.applyRemote` is the same shape for health. Every bug in
    this family has been two copies of one number.
  - **Local bite damage is suppressed while connected**, as is local health
    damage now. Same rule, same reason.
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
- **A KEY RELEASE YOU DO NOT STEP IS NEVER SENT, AND THE SERVER WALKS YOUR BODY
  AWAY WITHOUT YOU.** `sendIntent` lives inside `stepWorld` and is rate-limited
  to `NET.intentHz`, so `keyup` followed by ONE `stepWorld` is swallowed — and
  the server holds the last intent it was given, `forward: 1`, for ever. Measured
  at **36.1 m** of split with the client stationary; it cost this session a wrong
  theory that the 417 m position bug had returned (it had not — a clean join
  measures **0.01 m**). After releasing a key, keep stepping for at least
  `1000/NET.intentHz` ms of REAL time before believing any position.
- **A number the server refuses is invisible from both ends unless it is
  printed.** The server now logs every fire claim it takes or drops, with the
  reason (`~ Claude's fire at -25.1, 88.9 — too far from you to be yours`). That
  one line turned two wrong guesses into an answer in a single run. When
  something crosses the wire and does not arrive, log it at the receiving end
  BEFORE theorising about the sending end.
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
- **`ctrl.position.set(...)` IS THE SAME TRAP AS `warp`, and it cost this run
  three readings.** It is a fine way to put your camera where the thing is, and
  it is fatal to anything the server must agree about: the server's copy of you
  stays where it was, so your next claim arrives from a body 10 m — then 41 m —
  away and is refused, and the refusal looks exactly like the fix being broken.
  Re-align with `ctrl.position.set(...snap.me.p)` (also local, but it agrees) and
  **print the split before believing anything positional**. `snap` is readable
  live from `highlands.net.buffer[len-1].snap` — that one line settled it.
- **The server's stdout does not reach a redirected log file promptly.** Its fire
  log (`* Claude's fire at … — lit`) was invisible in the captured file all run.
  Read the state from the CLIENT instead — `net.buffer[…].snap.fi` is the
  server's own list, and it needs no console at all.
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
- **`javascript_tool` gives up at 30 SECONDS** and returns nothing at all, though
  the world keeps running behind it. Any observation longer than that has to be
  split, or taken as a reading afterwards rather than a trace during.
- **The socket keeps delivering while `stepWorld` is not running.** `onmessage`
  is not driven by your loop, so between two tool calls the client is frozen but
  the server is not: deaths, respawns and teleports all land in the gap. Twice
  this run a measurement opened 50 m from where the previous one closed, and the
  first reading of the next cell was the mystery. **Do the whole observation in
  one cell**, and never compare a position across two.
- **Pace `stepWorld` to the WALL CLOCK for anything networked.** Twelve steps per
  60 ms of real time is 3.3× speed, and the server does not come with you: it
  showed up as a 28.34 m position split that looked exactly like a regression in
  the fix that had just closed one. Accumulate real elapsed time and step
  `while (carry >= 1/60)`. Under that rule the same walk read 0.11 m.

## The game queue, ranked

1. **YOUR CORE TEMPERATURE IS NOW SAFE TO READ, AND STILL IS NOT READ.** This is
   the top of the queue and it is genuinely small: `me.c` is in every snapshot,
   and the one thing that made it a lie — the server's copy of you standing in a
   world with no fire in it — is fixed in both directions as of 15:40. Give
   `Body` the same `applyRemote`/`takeOverLocally` treatment for `coreC` that it
   has for `health`, and check what else writes `coreC` locally before calling it
   done (that is the lesson the fuel taught this run). **`me.f` is NOT part of
   this** — see below.
2. **Your food is still your own opinion, and the fix is NOT one line.** Blocked
   on #6: nothing can ever feed the server's copy of you. `intent.eat` is on the
   wire and no handler reads it, and the server's `p.inventory` is not your
   inventory — so reading `me.f` today means eating does nothing (overwritten
   ~5×/s) and everybody starves on a schedule they cannot touch. The route in is
   an `intent.eat` handler plus a server-side inventory, not a read.
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

**Both unexplained 12:25 readings are now closed**, and they were one root: the
client keeping its own copy of a number the server owns. The LOCAL cub 341.6 m
away was the body split; the midday sky at server 01:00 was the clock.

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

*(This file is 328 lines by `wc -l`, not the 100 it asks for, and the note here
has twice been an estimate that was already wrong — so do not trust it, run
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
