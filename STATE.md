# State of play — read this first, it is short on purpose

`FINDINGS.md` is 1500+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 07:35, by the session that closed the single-anchor cull.

## What works right now

- **Everyone hunts the same animals.** `npm run herdcheck` 12/12 — a real
  server, two real sockets, two instances of the real client-side `Wildlife`.
- **Arrows can hit players.** `arrowcheck` 7/7. **A browser client's shot
  works** — `shotcheck` 8/8. **Wounds persist** (7/7). **Standing orders** 17/17.
- **The client reads world events** — deaths, hits and glances reach the chat
  column. **Chat is a column on the right.** **`B` opens a build chooser.**
- **`E` obeys one distance rule.** **Captures are real pictures** (~112 KB).

## The private herd is CLOSED — do not chase it again

Everyone ran a private local wildlife sim and dropped `snapshot.cr` on the
floor, so two people side by side hunted different deer. The client is now a
MIRROR when connected (`Wildlife.setRemote`/`applySnapshot`, gated in `main.js`
on `net.connected`). Guarded by `herdcheck` 12/12. Single-player is untouched.
Detail in `FINDINGS.md`, 2026-08-05 06:40.

## The single-anchor cull is CLOSED — and it was two bugs

`npm run spreadcheck` 10/10. Guarded, and the check was verified failing 4/7
against the pre-fix source before it was trusted. Detail in `FINDINGS.md` under
2026-08-05 07:30. There is no open bug right now — take the top of the queue.

Culling measured every distance to `everyone[0]` while spawning followed
everybody, so animals were born around player two and deleted on the frame they
were born, permanently. `manager.update` now builds a `watchers` list and each
creature uses its NEAREST one — for the cull, for LOD, and for `c.update`, so a
deer is sensed with the stealth of whoever is actually next to it.

**Fixing the cull alone was not enough**, which is the part worth remembering:
the survivors then all came out of one shared cap of 26 and six players a
kilometre apart measured 15, 7, 0, 0, 0, 0 within sight. `maxAlive` is now a
budget PER player with a ceiling (`maxAliveTotal: 120`) via `aliveCap()`; the
same six then got 15, 10, 19, 11, 13, 9 at 0.103 ms/tick of a 16.7 ms budget.
One player is one budget, so single-player is unchanged.

Live, real server, two sockets, one holding sprint-forward for 200 s: 923 m
apart, 75 alive, nearest animal 117.0 m and 129.4 m.

## Corrections to things this file used to say

- **A fresh server does NOT clear the duplicate roster.** `[#1 Eachann, #4
  Eachann, #5 Morag]` is a name collision between the server's own rival hunters
  and the `agents.js` name pool, not stale state. Restarting to fix it is waste.
- **Stale processes ARE worth checking, and here is where they come from.** A
  server started as a background command is torn down at the end of the agent
  turn — but not always cleanly: this run's `agents.js` died with the wrapper
  while `server.js` survived it, kept port 8080, and went on ticking into a
  closed stdout pipe (log frozen, process alive). That is the orphan the next
  session inherits. Five of them were waiting this morning. Find them with
  `wmic process where "name='node.exe'" get processid,commandline` — the port
  check alone does not see the agents at all — and **kill them at the end of
  your own run**, not just the start.
- **`warp` is client-only and silently refused in Survival** (it *returns* the
  refusal as a string). Even in Sandbox the server never hears about it: a
  browser sends intents, not positions. Any multiplayer measurement taken after
  a warp is worthless. Walk, or drive headless clients by intent.
- **A creature's Object3D is `c.object`** — not `root`/`group`/`mesh`.

## Two sessions can be running at once — check before you edit

Before touching source: `git log --oneline -3` AND `git pull`, not just the
`SESSION.log` mtime check. A live browser client may be connected to :8080, and
a source edit bounces it to the menu via Vite's reload.

## The game queue, ranked

1. **Nobody is told how to aim.** Deer are findable and stalkable (walked one to
   25 m, unalarmed). The KILL is missing: the herd sits uphill and the shot needs
   ~20° of hold-over that nothing on screen tells you about. Aim at the animal
   and you hit the hillside at 9.7 m.
2. **Refusals never state their condition** — "not steep enough" on a 258%
   slope, "gather wood" while holding wood, "nothing in reach" 2.66 m from a
   visible tree when the truth is "you cut this one and it has not regrown".
3. **The fire is silent and invisible** — spawns at your feet, below the view,
   drawn under the hotbar.
4. **A fire cannot save a soaked player in the rain** — 36.1 → 28.0 either way.
5. **Window resize wrecks the sim** — `setPixelRatio` set once at boot.
6. **Goblins are unkillable in daylight** — flee 7.6 vs your sprint 8.6.
7. **Companions do not exist in multiplayer** — `Companion` appears 0 times in
   `sim/world.js`.
8. **A stranded glider cannot be recovered.**

**Unmeasured, seen in passing, worth one run:** over ~24 game minutes with 4
players the server's population drifted 68 → 37 (cap 120, so not the cap) across
02:00–05:00. Daybreak retiring the night shift would explain it, and so would
`clearedSites` slowly sterilising ground on a long run. I did not test which, so
do not repeat it as fact. `server.log` for the run is gone with the process.

Also measured: **animals graze on steep convex slopes and under canopy**, so a
blind-aimed `capture` of one mostly photographs a hillside — four tries, no deer
in frame, even with a line-of-sight test, because `heightAt` does not know about
trees. Item 1 is the same terrain in a different hat.

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
is back. The HUD is DOM and can NEVER appear in a capture.

## The trap this project falls into

**A function used with no import.** Five times in one day: `clamp`/`damp`,
`vitals.hurt`, `appendFileSync`, `amountText`, `SPECIES`. Invisible to typecheck
and build; only found by running the line. Grep every identifier your new code
uses before committing.

**And a clean build proves nothing.** Verify by driving the game.
