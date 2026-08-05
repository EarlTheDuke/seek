# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 08:40, by the session that turned the glider round.

## What works right now

- **Everyone hunts the same animals**, arrows hit players, wounds persist, the
  cull is per-player, standing orders are obeyed. All twelve suites green this
  run (`herdcheck` 12, `arrowcheck` 7, `ordercheck` 17, `glidercheck` 32,
  `netcheck` 12, `mindcheck` 21, `campcheck` 20, `companioncheck` 29 …).
- **You can see where your arrow will land** (`weapons/aimMark.js`, the run
  before: predicted impact agrees with a loosed arrow to 1–2 cm), and **the
  glider now flies where you are looking** — see below.
- The client reads world events; chat is a column on the right; `B` opens a
  build chooser; `E` obeys one distance rule; captures are real pictures.

## CLOSED: the glider launched, checked and looked backwards

Queue item 1's headline example — "not steep enough" on a 258% slope — was
**not a wording bug.** The message was honest; it described the hill behind you.
Walking forward is `(−sin yaw, −cos yaw)` (measured at three yaws; the camera's
`matrixWorld` agrees) but `glider.js` integrates `(+sin h, +cos h)`, and
`main.js` handed it a raw `ctrl.yaw`. So `canLaunch` probed **behind** you,
`launch()` flew you that way, and `ctrl.yaw = flight.heading` aimed the camera
back down the track — which is why the wing is in none of the old in-flight
captures: it is behind the eye. Flown, not argued: from a spot the OLD check
accepted, looking toward −x, the glide carried me 45 m toward **+x** (alignment
with gaze **−1.0**; after the fix **+0.995**). Compare
`shots/launch-view-before.jpg` — a hillside rising to a ridge, the view the game
called a good launch — with `launch-view-after-fix.jpg`.

Fixed at the seam, not in the module: `flightHeading` / `viewYaw` in `main.js`
at all three crossings, so `glider.js` keeps its convention and its 32 checks
keep their meaning. **The refusal now states its condition** too — the slope
measured, the slope needed, and a twelve-bearing sweep (refusal path only) for
which way to turn: "the ground ahead of you climbs at 2% and a launch needs 70%
— it falls 93% about 90° to your left". Verified by turning, not by trusting the
derivation. Numbers in `FINDINGS.md` 2026-08-05 08:35.

## Two ways a measurement silently lies to you

- **`warp` does not cancel a glide.** `updateFlight` rewrites `ctrl.position`
  from the flight state every step, so a warp issued while airborne is gone on
  the next `stepWorld`. It cost this run a full set of four readings: I asked
  for (−20, −160) and measured at (−226, −270), 235 m away, and the messages
  looked wrong when they were right for where I actually was. **Step until
  `highlands.flight` is falsy before measuring after a flight.**
- **`warp(x, z)` used to NaN the camera** (fixed the run before: `yaw` had no
  default). If you are re-reading an old number in the notes, check whether it
  warped first.

## Things that will waste your time if you do not know them

- **A fresh server does NOT clear the duplicate roster.** `[#1 Eachann, #4
  Eachann, #5 Morag]` is a name collision between the server's own rival hunters
  and the `agents.js` name pool, not stale state. Restarting to fix it is waste.
- **Stale processes ARE worth checking, and here is where they come from.** A
  server started as a background command is torn down at the end of the agent
  turn — but not cleanly: `agents.js` dies with the wrapper while `server.js`
  survives it, keeps port 8080 and ticks on into a closed stdout pipe (log
  frozen, process alive). Find them with
  `wmic process where "name='node.exe'" get processid,commandline` — the port
  check does not see the agents at all — and **kill them at the end of your own
  run**, not just the start.
- **`warp` is refused in Survival** (it *returns* the refusal as a string), and
  in multiplayer the server never hears about it: a browser sends intents, not
  positions. Any multiplayer measurement after a warp is worthless.
- **A creature's Object3D is `c.object`** — not `root`/`group`/`mesh`.
- **Deer wander.** Capturing a deer's position once and then stepping the world
  through a long scan aims you at where it used to be. It cost this run two
  wrong readings — "0 of 72 stands work", actually 39. Re-read it every stand.
- **`highlands.report({steps})` wants an ARRAY.** Pass a string and it throws
  `steps.map is not a function` and files nothing.
- **`agentcheck` is 16/17**, failing "they build memories from what they see".
  Pre-existing — confirmed by stashing this run's changes and re-running.

## Two sessions can be running at once — check before you edit

Before touching source: `git log --oneline -3` AND `git pull`, not just the
`SESSION.log` mtime check. A live browser client may be connected to :8080, and
a source edit bounces it to the menu via Vite's reload. This run had a commit
land underneath it mid-session; re-read `STATE.md` before rewriting it.

## The game queue, ranked

1. **Refusals never state their condition** — glider DONE (above); two left,
   both reproduced this run, so it is a short job:
   - `main.js:1205` "nothing you can build — gather wood" while holding wood.
     `bestToBuild` returns null only when *nothing* is affordable; the message
     should name the cheapest shortfall, which `Structures.affordable` already
     computes and throws away.
   - "nothing in reach" 2.00 m from a tree you just cut (stand at a trunk, press
     E twice). `nearestSource` skips `isTaken` and returns null, so
     `hud.setPrompt(null)` makes the prompt *vanish* — the player is told
     nothing at all. `harvest.taken` holds the exact regrow hour.
2. **The fire is silent and invisible** — spawns at your feet, below the view,
   drawn under the hotbar.
3. **A fire cannot save a soaked player in the rain** — 36.1 → 28.0 either way.
4. **Window resize wrecks the sim** — `setPixelRatio` set once at boot.
5. **Goblins are unkillable in daylight** — flee 7.6 vs your sprint 8.6.
6. **Companions do not exist in multiplayer** — `Companion` appears 0 times in
   `sim/world.js`.
7. **A stranded glider cannot be recovered.**

**Unmeasured, seen in passing, worth one run:** over ~24 game minutes with 4
players the server's population drifted 68 → 37 (cap 120, so not the cap) across
02:00–05:00. Daybreak retiring the night shift would explain it, and so would
`clearedSites` slowly sterilising ground on a long run. Nobody tested which, so
do not repeat it as fact.

Still true, and now visible rather than merely annoying: **animals graze on
steep convex slopes and under canopy**, so a blind-aimed `capture` of one mostly
photographs a hillside — `heightAt` does not know about trees.

Small and deliberate, left by the mirror: multiplayer carcass harvesting fills a
LOCAL inventory only, and a mirrored animal's morale/`hurt` flags are never sent.

Worth a look, unfixed: `glider.js` samples ridge lift upwind with `(−sin, −cos)`
of `wind.angle` while integrating flight in `(+sin, +cos)`. Untouched this run
because nothing establishes which way `wind.angle` points — find that out first.

## How to play it

```
npx vite --port 5173 --strictPort
DANGER=no-bears node server/server.js 8080
ORDERS=obeys node server/agents.js 2
```

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button (**Sandbox** if you need `warp`), then drive with
`window.highlands.stepWorld(1/60)` — in REAL time, `setTimeout` between steps,
for anything networked. **The preview pane does not composite when it is not
displayed**, so `requestAnimationFrame` never fires and the world looks frozen
and connected-but-dead. Not a bug; it is why `stepWorld` exists.

Because of that the pane reports a **0×0 viewport**, so clicking the mode button
by element ref lands at a negative y and silently starts Survival — where `warp`
is refused. Click it from the page instead:
`[...document.querySelectorAll('button')].find(b=>/Sandbox/.test(b.textContent)).click()`,
and check `highlands.ruleset.current.id` before trusting anything.

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**,
it is the only way anyone sees this game. Under ~5 KB means the blind-pane bug
is back. The HUD is DOM and can NEVER appear in a capture.

## The trap this project falls into

**A function used with no import.** Five times in one day: `clamp`/`damp`,
`vitals.hurt`, `appendFileSync`, `amountText`, `SPECIES`. Invisible to typecheck
and build; only found by running the line. Grep every identifier your new code
uses before committing.

**And a clean build proves nothing.** Verify by driving the game.
