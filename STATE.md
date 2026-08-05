# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 08:45, by the session that closed queue item 1.

## What works right now

- **Everyone hunts the same animals**, arrows hit players, wounds persist, the
  cull is per-player, standing orders are obeyed. All twelve suites green this
  run (`campcheck` now 26, `glidercheck` 32, `companioncheck` 29, `mindcheck`
  21, `bookcheck`/`reportcheck` 18, `ordercheck` 17, `netcheck`/`herdcheck` 12,
  `dangercheck` 12, `arrowcheck`/`woundcheck` 7).
- **You can see where your arrow will land** (`weapons/aimMark.js`: predicted
  impact agrees with a loosed arrow to 1–2 cm), and **the glider flies where you
  are looking**.
- The client reads world events; chat is a column on the right; `B` opens a
  build chooser; `E` obeys one distance rule and now **always answers** —
  gather, build and launch refusals all state their condition.

## CLOSED: queue item 1, "refusals never state their condition" — all three

- **The glider** (run before) launched, checked and *looked* backwards: forward
  is `(−sin yaw, −cos yaw)` but `glider.js` integrates `(+sin h, +cos h)` and
  `main.js` handed it a raw `ctrl.yaw`, so the check probed **behind** you.
  Fixed at the seam (`flightHeading` / `viewYaw`), so the module keeps its
  convention and its 32 checks keep their meaning.
- **"gather wood" while holding wood** (this run): `bestToBuild` returns null
  when nothing is affordable and the caller *guessed* a material — wrong the
  moment you lack hide. New `Structures.shortfall` / `missingFor` say it:
  *"nothing you can build yet — the windbreak is nearest: you need 1 branch"*.
- **"nothing in reach" at a tree you just cut** (this run) — worse than
  reported: the prompt did not say that, it **vanished**. `nearestSource` skips
  a taken source, `setPrompt(null)` wipes the line, and you are told nothing at
  all one metre from a tree. New `Harvest.nearestTaken` (the exact mirror,
  sharing one `scanFor` so they cannot drift): *"this tree is already cut —
  about a day until it regrows"*. It deliberately does NOT enter the distance
  race — checked only where the answer would otherwise be null, so it can never
  take the key off a fire you could feed. Verified by lighting one.

Numbers for all three in `FINDINGS.md`, 2026-08-05 08:35 and 08:45.

## Things that will waste your time if you do not know them

- **`warp` does not cancel a glide** — `updateFlight` rewrites `ctrl.position`
  every step, so a warp issued airborne is gone on the next `stepWorld`. Step
  until `highlands.flight` is falsy before measuring after a flight. And `warp`
  is refused in Survival (it *returns* the refusal as a string); in multiplayer
  the server never hears it, so any networked measurement after one is worthless.
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
- **A creature's Object3D is `c.object`** — not `root`/`group`/`mesh`.
- **Deer wander.** Capturing a deer's position once and then stepping the world
  through a long scan aims you at where it used to be. It cost a run two wrong
  readings — "0 of 72 stands work", actually 39. Re-read it every stand.
- **`highlands.report({steps})` wants an ARRAY.** Pass a string and it throws
  `steps.map is not a function` and files nothing.
- **`agentcheck` is 16/17**, failing "they build memories from what they see".
  Pre-existing — confirmed by stashing this run's changes and re-running.
- **`netcheck` needs a server up.** Run it in a bare loop with the other suites
  and it prints "could not run" and no score, which reads as a hang or a pass
  depending on how you grep. Start `server.js` first, then it is 12/12.
- **The scatter collider field is `highlands.scatter.colliders`**, not
  `highlands.colliders` — that one has `.scatter`/`.static` sub-fields and its
  own `.list` is empty, so a tree search against it silently finds nothing.

## Two sessions can be running at once — check before you edit

Before touching source: `git log --oneline -3` AND `git pull`, not just the
`SESSION.log` mtime check. A live browser client may be connected to :8080, and
a source edit bounces it to the menu via Vite's reload. This run had a commit
land underneath it mid-session; re-read `STATE.md` before rewriting it.

## The game queue, ranked

1. **The fire is silent and invisible** — spawns at your feet, below the view,
   drawn under the hotbar. Now photographed as well as reported: it is the
   sliver at the bottom edge of `shots/spent-source-fire.jpg`.
2. **A fire cannot save a soaked player in the rain** — 36.1 → 28.0 either way.
3. **Window resize wrecks the sim** — `setPixelRatio` set once at boot.
4. **Goblins are unkillable in daylight** — flee 7.6 vs your sprint 8.6.
5. **Companions do not exist in multiplayer** — `Companion` appears 0 times in
   `sim/world.js`.
6. **A stranded glider cannot be recovered.**

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
is back. The HUD is DOM and can NEVER appear in a capture — to check a prompt,
read `document` text instead.

**You can press keys.** `window.dispatchEvent(new KeyboardEvent('keydown',
{code:'KeyE'}))`, one `stepWorld`, then the matching `keyup`, works for E / G /
B without pointer lock — so gathering, lighting and building are all drivable
headlessly. `highlands.whatWouldEDo()` returns the prompt without pressing.

## The trap this project falls into

**A function used with no import.** Five times in one day: `clamp`/`damp`,
`vitals.hurt`, `appendFileSync`, `amountText`, `SPECIES`. Invisible to typecheck
and build; only found by running the line. Grep every identifier your new code
uses before committing.

**And a clean build proves nothing.** Verify by driving the game.
