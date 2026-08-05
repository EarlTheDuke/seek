# State of play — read this first, it is short on purpose

`FINDINGS.md` is 1500 lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05 06:40, by the session that closed the arrow bug.

## What works right now

- **Arrows can hit players.** `npm run arrowcheck` 7/7. Hit takes 100 → 79,
  glances state their reason, party members safe, archer cannot shoot self.
- **The client reads world events.** Deaths, hits and glances reach the chat
  column. Verified live: "Eachann was killed by Troll 366 m south-east of Wolf
  Cleugh".
- **Chat is a column on the right**; **wounds persist** (7/7); **standing
  orders** `follow`/`guard` (17/17); **agents know where they are** (the `me`
  block); **`B` opens a build chooser** instead of always making a windbreak.
- **`E` obeys one distance rule.** The pet used to win against a tree it was
  never racing; it now competes on distance like everything else.

- **A browser client's shot works.** `npm run shotcheck` 8/8 — a real server, two
  real sockets, steered by look deltas, asks the SERVER what happened.

## The arrow bug is CLOSED — do not chase it again

**The server loosed every arrow from the archer's ankles.** `makeAimProxy` gave
the weapons `ctrl.position` — the GROUND under you — where the browser's camera
sits `eyeHeight` above it. So the arrow spawned at ankle height and buried
itself on frame one (`spawned 46.85, landed 45.90`), never appeared in `pr`, and
hit nothing. From the client that is indistinguishable from a press that never
crossed the wire, which is why five theories reasoned from that end were wrong.
Fixed in `sim/world.js` and its twin in `sim/headless.js`.

It applied to every remote player, rival hunter and agent — so weigh it against
queue item 1: **the agents have been firing into the dirt at their feet all
along.** `arrowcheck` calls `projectiles.spawn` directly and structurally cannot
see this class of bug; `shotcheck` exists to cover exactly that gap.

## The one open bug

**In multiplayer, every player hunts a private herd the server knows nothing
about.** `main.js` comments that "other people, creatures, arrows" are drawn
from server snapshots. Only PEOPLE are. `avatars.update` consumes `snapshot.pl`
and nothing anywhere consumes `snapshot.cr` or `snapshot.pr` — they are decoded,
interpolated, and dropped. Meanwhile the client keeps running its own local
`wildlife`. Measured, same instant, same client:

    my local world:   24 creatures, nearest deer  20 m
    the server's:     20 creatures, nearest deer 1390 m

So kills are local fiction, other players' arrows are invisible, and two people
standing together see different animals. This is the THIRD instance of one
disease — the server sends it, the client decodes it, nobody consumes it (the
first was `ev`, the second was this run's `pr`). Not attempted: making creatures
server-authoritative is a real piece of work, not a slice, and half-wiring it is
this project's classic failure.

## Two sessions can be running at once — check before you edit

This file and a source fix landed within seven minutes of each other on
2026-08-05 from two different runs. Neither clobbered the other, but both were
editing blind. Before touching source: `git log --oneline -3` AND `git pull`,
not just the `SESSION.log` mtime check. A live browser client named `Ben` was
also connected to :8080 throughout, so a source edit will have bounced it to the
menu via Vite's reload.

## Known-bad state that corrupts tests

- Duplicate names in the roster (Eachann twice).
- A rival hunter at -2414, -18489 — eighteen kilometres outside the world.
- The server reached 9 players against a cap of 8 and locked `agentcheck` out.

Until the roster is trustworthy, no multiplayer result is trustworthy.

## The game queue, ranked

1. **The economy.** ~~Never closer than 227 m~~ — **that measurement was
   wrong.** Walked one down on 2026-08-05: 116 m → 44 m before it noticed at
   all, then crouched to 25 m with it still unalarmed and grazing. Deer are
   findable and stalkable. What is missing is the KILL: three arrows at 20–25 m
   all missed, because the herd sits uphill and the shot needs about 20° of
   hold-over that nothing on screen tells you about. Aim at the animal and you
   hit the hillside at 9.7 m. **Re-scope this item from "nobody can find a deer"
   to "nobody is told how to aim at one".**
2. **Refusals never state their condition** — "not steep enough" on a 258%
   slope, "gather wood" while holding wood. New instance, 2026-08-05: standing
   2.66 m from a visible tree, `E` says **"nothing in reach"**. The truth is
   "you already cut this one and it has not regrown" — the refusal names neither
   the reason nor the wait.
3. **The fire is silent and invisible** — spawns at your feet, below the view,
   drawn under the hotbar.
4. **A fire cannot save a soaked player in the rain** — 36.1 → 28.0 either way.
5. **Window resize wrecks the sim** — `setPixelRatio` set once at boot.
6. **Goblins are unkillable in daylight** — flee 7.6 vs your sprint 8.6.
7. **Companions do not exist in multiplayer** — `Companion` appears 0 times in
   `sim/world.js`.
8. **A stranded glider cannot be recovered.**

## How to play it

```
npx vite --port 5173 --strictPort
DANGER=no-bears node server/server.js 8080
ORDERS=obeys node server/agents.js 2
```

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button, then drive with `window.highlands.stepWorld(1/60)`. For
anything networked, drive in REAL time with `setTimeout` between steps.

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**,
it is the only way anyone sees this game. It used to write ONE GREY PIXEL from a
hidden pane (761 bytes, reported as saved) because `innerWidth` is 0 there and
`syncSize` clamped the renderer to 1×1; fixed 2026-08-05, now ~120 KB and a real
picture. If a shot ever comes back under about 5 KB, suspect this again.

The HUD is DOM, so it can NEVER appear in a capture — `toDataURL` only sees the
WebGL canvas. That settles the old "the HUD is gone from the screenshots" note:
nothing is broken, it was never capturable.

## The trap this project falls into

**A function used with no import.** Five times in one day: `clamp`/`damp`,
`vitals.hurt`, `appendFileSync`, `amountText`, `SPECIES`. Invisible to
typecheck and build; only found by running the line. Grep every identifier your
new code uses before committing.

**And a clean build proves nothing.** Verify by driving the game.
