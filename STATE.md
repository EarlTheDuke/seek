# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 08:05, by the session that put the mark on the world.

## What works right now

- **Everyone hunts the same animals.** `herdcheck` 12/12. **Arrows can hit
  players** (`arrowcheck` 7/7), a browser client's shot works (`shotcheck` 8/8),
  wounds persist (7/7), standing orders 17/17, and the cull is per-player
  (`spreadcheck` 10/10).
- **You can see where your arrow will actually go.** The mark — see below.
- The client reads world events; chat is a column on the right; `B` opens a
  build chooser; `E` obeys one distance rule; captures are real pictures.

## The missing kill is CLOSED — and the queue had it diagnosed wrong

Queue item 1 used to read "nobody is told how to aim… the shot needs ~20° of
hold-over". **That is not the bug.** Drop is 0.12 m at 10 m and 0.50 m at 20 m,
matching the spec in `ARROW` exactly. Twenty degrees at 20 m would be seven
metres of drop. Nothing like it exists, and the bow was never the problem.

The real fault: aiming dead at a deer at 35 m from twelve stands on a ring,
full draw, spread removed — **12 of 12 arrows hit the ground short**, by 5.4 to
29.9 m, **with the animal in clear view at 8 of those 12 stands.** The sight
line clears the intervening ground by only **0.2–0.9 m**, while the arrow drops
**0.5 m by 20 m and 1.1 m by 30 m**. The drop is bigger than the clearance, so
a shot that looks perfectly clear is stopped by a shallow rise no eye can read
on a smooth heightfield. The shot was not missed — it was never available.

**The fix is `src/weapons/aimMark.js`:** while the bow is drawn, a ring is drawn
on the world where the arrow would actually stop — warm on flesh, pale on
ground. It adds no accuracy and tracks nothing. When it sits on the hillside
twelve metres ahead instead of on the deer, the answer is to move, which is the
stalk doing its job.

It cannot drift from the real arrow because it *is* the arrow's code:
`Projectiles.advance` and the new `Projectiles.predict` both collide through one
extracted pure query, `Projectiles.sweep`, at the same `ARROW.substep`.

Verified by playing, not by building: predicted impact agrees with a real loosed
arrow to **1–2 cm**; the ring is the real spread cone, so it shrinks **0.34 m →
0.06 m as you draw** and swells with fatigue, which finally makes that mechanic
visible; 0.19 ms of a 16.7 ms frame, only while a draw is held. Scanning stands
around one deer: **39 of 72 give a shot ON the animal** — blocked at 28 m, ON at
20 m and 12 m. "Get closer" is now something the game can say.

Detail, and the two traps it cost time on, in `FINDINGS.md` 2026-08-05 08:20.

## Also fixed: `warp(x, z)` was silently NaN-ing the camera

`yaw` sat between two parameters that had defaults and had none itself, so the
obvious `warp(x, z)` set `ctrl.yaw = undefined`, NaN'd the camera quaternion and
then its world position. It surfaced three calls away as a *non-finite
AudioParam* throw from `Soundscape.spatial` on the next arrow impact.
**Any Sandbox measurement taken after a two-argument warp was garbage** — if you
are re-reading an old number in the notes, check whether it warped first. `yaw`
now defaults to the facing you already had.

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

1. **Refusals never state their condition** — "not steep enough" on a 258%
   slope, "gather wood" while holding wood, "nothing in reach" 2.66 m from a
   visible tree when the truth is "you cut this one and it has not regrown".
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

Left behind by the mirror, deliberately, and small: harvesting a carcass in
multiplayer fills a LOCAL inventory the server knows nothing about, and a
mirrored animal's morale/`hurt` flags are never sent. Neither is visible in play.

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

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**,
it is the only way anyone sees this game. Under ~5 KB means the blind-pane bug
is back. The HUD is DOM and can NEVER appear in a capture. This run is the case
in point: every number said the mark was correct and on the animal, and the
first picture showed no ring at all.

## The trap this project falls into

**A function used with no import.** Five times in one day: `clamp`/`damp`,
`vitals.hurt`, `appendFileSync`, `amountText`, `SPECIES`. Invisible to typecheck
and build; only found by running the line. Grep every identifier your new code
uses before committing.

**And a clean build proves nothing.** Verify by driving the game.
