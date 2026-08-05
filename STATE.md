# State of play — read this first, it is short on purpose

`FINDINGS.md` is 1500+ lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 06:51, by the session that closed the private-herd bug.

## What works right now

- **Everyone hunts the same animals.** `npm run herdcheck` 12/12 — a real
  server, two real sockets, two instances of the real client-side `Wildlife`.
- **Arrows can hit players.** `arrowcheck` 7/7. **A browser client's shot
  works** — `shotcheck` 8/8. **Wounds persist** (7/7). **Standing orders** 17/17.
- **The client reads world events** — deaths, hits and glances reach the chat
  column. **Chat is a column on the right.** **`B` opens a build chooser.**
- **`E` obeys one distance rule.** **Captures are real pictures** (~112 KB).

## The private herd is CLOSED — do not chase it again

Every player ran a full local wildlife simulation while the server ran another,
and `snapshot.cr` was decoded, interpolated and dropped on the floor. Kills were
private fiction and two people side by side hunted different deer.

Fixed by making the client a MIRROR when connected: `Wildlife.setRemote` /
`applySnapshot` (`creatures/manager.js`), gated in `main.js` on `net.connected`,
with `Creature.applyDamage` refusing to hurt a body it does not own. Measured in
the browser after the fix, same instant, same client:

    my local world:   18 creatures, nearest deer 836.9 m
    the server's:     18 creatures, nearest deer 836.9 m

Single-player is untouched — no `?join=`, no mirror, 23 local creatures, nearest
deer 111 m, exactly as before.

## The one open bug — spawning is multi-anchor, CULLING IS NOT

Animals are born around every player and then deleted for everyone but the
first, because `manager.update` culls on distance to `playerPos`, which
`world.js updateWildlife` fills from `everyone[0]` alone. Printed state, two
players 900 m apart, four seconds:

    11 alive — nearest to Ann 110 m, nearest to Bel 931 m
    removals: 15 total, 15 of them standing WITHIN Bel's spawn radius

Fifteen animals spawned around the second player and every one was culled on the
frame it was born. It is permanent, too: the site stays in `spawnedSites`, so it
never refills. Confirmed live — all 18 creatures on the server were within 50 m
of player #1 while #4, #5 and #6 were 605, 987 and 823 m from the nearest
animal. **This is why multiplayer looks empty, and it is not the cap** — that is
26 and only 18 were alive. The fix is a cull that asks "near ANY player", which
`countPlayersNear`/`nearestPlayer` in `world.js` already know how to answer.

## Corrections to things this file used to say

- **A fresh server does NOT clear the duplicate roster.** Restarted clean, two
  agents, and the welcome already read `[#1 Eachann, #4 Eachann, #5 Morag]`. It
  is a name collision between the server's own rival hunters and the `agents.js`
  name pool — not stale state. Restarting to fix it is wasted time.
- The old "nearest deer 227 m / 1390 m" figures are superseded by the numbers
  above; the 1390 m one was this bug, seen from the wrong end.

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

Left behind by the mirror, deliberately, and small: harvesting a carcass in
multiplayer still fills a LOCAL inventory the server knows nothing about, and a
mirrored animal's morale/`hurt` flags are never sent, so pack chatter runs at
full confidence. Neither is visible in play yet.

## How to play it

```
npx vite --port 5173 --strictPort
DANGER=no-bears node server/server.js 8080
ORDERS=obeys node server/agents.js 2
```

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button, then drive with `window.highlands.stepWorld(1/60)`. For
anything networked, drive in REAL time with `setTimeout` between steps.

**The preview pane does not composite when it is not displayed**, so
`requestAnimationFrame` never fires and the game loop does not run at all — the
world looks frozen and connected-but-dead. That is not a bug, it is why
`stepWorld` exists. Drive it by hand and everything works.

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**,
it is the only way anyone sees this game. Under ~5 KB means the blind-pane bug
is back. The HUD is DOM and can NEVER appear in a capture.

## The trap this project falls into

**A function used with no import.** Five times in one day: `clamp`/`damp`,
`vitals.hurt`, `appendFileSync`, `amountText`, `SPECIES`. Invisible to typecheck
and build; only found by running the line. Grep every identifier your new code
uses before committing.

**And a clean build proves nothing.** Verify by driving the game.
