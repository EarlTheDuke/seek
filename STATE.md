# State of play — read this first, it is short on purpose

`FINDINGS.md` is 2000+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 09:52, by the session that got the rain off the fire.

## What works right now

- **Everyone hunts the same animals**, arrows hit players, wounds persist, the
  cull is per-player, standing orders are obeyed. All twelve suites green
  (`campcheck` now **36**, `glidercheck` 32, `companioncheck` 29, `mindcheck`
  21, `bookcheck`/`reportcheck` 18, `ordercheck` 17, `netcheck`/`herdcheck` 12,
  `dangercheck` 12, `arrowcheck`/`woundcheck` 7).
- **A fire is something you can see and hear** — photographed by night at last:
  `shots/fire-at-3m-night.jpg`.
- **You can see where your arrow will land** (predicted impact agrees with a
  loosed arrow to 1–2 cm) and **the glider flies where you are looking**.
- The client reads world events; chat is a column on the right; `B` opens a
  build chooser; `E` obeys one distance rule and **always answers** — gather,
  build and launch refusals all state their condition.

## CLOSED: queue #1, "a fire cannot save a soaked player in the rain"

Two claims in one. **The bug:** `Fires.update` dimmed every fire by the GLOBAL
`weather.rain`, so a fire under a lean-to roof was still being rained on — 44%
of its warmth gone and fuel burning twice as fast. `structures.roofedAt()` had
existed all along and `main.js` already called it for the PLAYER; nothing had
ever asked it for a fire. `Fires` now takes a `roofedAt` dep. Live, rain 1.0:
roofed fire **intensity 1.000 / fuel 40.7**, open fire **0.428 / 35.4**. Photo:
`shots/leanto-fire-in-the-rain.jpg`. campcheck is now **36** and asserts both
intensities AND that main.js still passes the dep.

**The part that was not a bug:** "36.1 → 28.0" was measured over 30+ real
minutes = two in-world DAYS. A night is 8.7 real minutes, and over one night
nobody dies of cold in any configuration (worst case 34.5; damage starts at
33.0). A fire in the open genuinely cannot beat rain — you re-soak at 0.018/s
and dry at 0.004/s, and being soaked costs ~15 C. Get the rain off you first.
Only `lean-to + fire + cloak` now sits above neutral (+0.020 C/min, holds 37);
it was −0.047 and slowly losing. Eight-row table in `FINDINGS.md` 09:50.

## CLOSED earlier: "the fire is silent and invisible"

Invisible because it was laid **below the frame** (1.6 m ahead projected to row
927 of 720) — `SURVIVAL.firePlaceDistance` is now 3 m, and must stay under
`SURVIVAL.fireReach` 3.4 m, which campcheck asserts. Silent because
`Soundscape.fireLit` was never written and `?.` swallowed it. Full trace:
`FINDINGS.md` 2026-08-05 09:35.

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
  `agents.js` — **not** the project path, which is stored cwd-relative and will
  silently miss. The port check never sees the agents at all.
- **A fresh server does NOT clear the duplicate roster.** `[#1 Eachann, #4
  Eachann, #5 Morag]` is a name collision between the server's rival hunters and
  the `agents.js` pool, not stale state. Restarting to fix it is waste.
- **`warp` does not cancel a glide** — `updateFlight` rewrites `ctrl.position`
  every step. Step until `highlands.flight` is falsy before measuring after a
  flight. `warp` is refused in Survival (it *returns* the refusal as a string),
  and in multiplayer the server never hears it, so any networked measurement
  after one is worthless.
- **Deer wander.** Reading a deer's position once and then stepping through a
  long scan aims you where it used to be — it cost a run two wrong readings.
- **A long survival test measures FOOD, not what you think.** `dayMinutes: 26`,
  so 40 real minutes is 32 in-world hours and a shivering body (`hungerColdMul`
  1.9) starves first. A thermal probe reported deaths at 34.9 C — *above* the
  33.0 cold threshold — and they were all starvation. Pin `hunger`, or keep the
  window to one night (8.7 real min).
- **`highlands.report({steps})` wants an ARRAY.** A string throws and files
  nothing. **`agentcheck` is 16/17**, pre-existing. **`netcheck` needs a server
  up** or it prints "could not run" and no score.
- **The scatter collider field is `highlands.scatter.colliders`** — the other
  one's `.list` is empty, so a tree search against it silently finds nothing.
  **A creature's Object3D is `c.object`**, not `root`/`group`/`mesh`.

## The game queue, ranked

1. **Window resize wrecks the sim** — `setPixelRatio` set once at boot.
2. **Goblins are unkillable in daylight** — flee 7.6 vs your sprint 8.6.
3. **Companions do not exist in multiplayer** — `Companion` appears 0 times in
   `sim/world.js`.
4. **A stranded glider cannot be recovered.**
5. `glider.js` samples ridge lift upwind with `(−sin, −cos)` of `wind.angle`
   while integrating flight in `(+sin, +cos)`. Establish which way `wind.angle`
   points before touching it.
6. Multiplayer carcass harvesting fills a LOCAL inventory only, and a mirrored
   animal's morale/`hurt` flags are never sent. Small and deliberate, for now.

**Unmeasured, worth one run:** with 4 players the server's population drifted
68 → 37 over ~24 game minutes (cap is 120, so not the cap), across 02:00–05:00.
Daybreak retiring the night shift would explain it; so would `clearedSites`
sterilising ground. Nobody tested which — do not repeat it as fact.

## How to play it

```
npx vite --port 5173 --strictPort
DANGER=no-bears node server/server.js 8080
ORDERS=obeys node server/agents.js 2
```

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button (**Sandbox** if you need `warp`), then drive with
`window.highlands.stepWorld(1/60)` — in REAL time, `setTimeout` between steps,
for anything networked. **The pane does not composite when it is not displayed**,
so `requestAnimationFrame` never fires and the world looks frozen and
connected-but-dead. Not a bug; it is why `stepWorld` exists. It also reports a
**0×0 viewport**, so clicking the mode button by element ref lands at a negative
y and silently starts Survival — click it from the page instead
(`[...document.querySelectorAll('button')].find(b=>/Sandbox/.test(b.textContent))
.click()`) and check `highlands.ruleset.current.id`.

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**,
it is the only way anyone sees this game; under ~5 KB means the blind-pane bug
is back. The HUD is DOM and can never appear in one — but it DOES still lay out
against the 1280×720 that capture forces, so `getBoundingClientRect()` on a HUD
element gives real numbers to measure the world against. And **you can press
keys**: `dispatchEvent(new KeyboardEvent('keydown', {code:'KeyE'}))`, one
`stepWorld`, then the matching `keyup` drives E / G / B without pointer lock, so
gathering, lighting and building all work headlessly. `whatWouldEDo()` returns
the prompt without pressing anything.

## The trap this project falls into

**A name used and never defined.** `clamp`/`damp`, `vitals.hurt`,
`appendFileSync`, `amountText`, `SPECIES` — and now `audio.fireLit`, which hid
behind `?.` for a year and cost the game its fire sound. Invisible to build;
only found by running the line. Grep every identifier your new code uses.

**And a clean build proves nothing.** Verify by driving the game.
