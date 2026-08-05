# State of play — read this first, it is short on purpose

`FINDINGS.md` is 1500 lines and `DEV-NOTES.md` is 2900. Reading either cold
costs more context than the work does. This file is the current state, kept
under a hundred lines. **Update it at the end of every run.** If it grows past
that, cut the oldest resolved things rather than letting it become another
archive.

Last updated: 2026-08-05, by the session that set up the browser-client harness.

## What works right now

- **Arrows can hit players.** `npm run arrowcheck` 7/7. Hit takes 100 → 79,
  glances state their reason, party members safe, archer cannot shoot self.
- **The client reads world events.** Deaths, hits and glances reach the chat
  column. Verified live: "Eachann was killed by Troll 366 m south-east of Wolf
  Cleugh".
- **Chat is a column on the right**, six lines, fifteen seconds each.
- **Wounds persist** — a hurt creature no longer despawns and heal. 7/7.
- **Standing orders** — `follow` / `guard`, both obedience modes. 17/17.
- **Agents know where they are** and what their body is doing. The `me` block in
  the snapshot carries position, yaw, pitch, health, food, core temperature.
- **The build chooser** — `B` opens a menu instead of always making a windbreak.

## The one open bug

**An arrow fired from a real browser client produces no hit and no glance.**

Every link is verified individually: the intent carries `primary`, the wire
preserves it, the server fires the bow from a remote intent (headless:
`projectiles = 1`, `arrows left = 11`), the browser sends it (77 calls, all
true), and events reach the client.

I have been confidently wrong about the cause **four times**: the intent, the
rate limiter, the release, and "it is a ghost". Every one by reasoning from
whichever end I was looking at.

**Do this and nothing else first: print `p.connected`, `p.body.dead` and the
player list SERVER-SIDE while a shot is fired.** Stop theorising.

## Known-bad state that corrupts tests

- Duplicate names in the roster (Eachann twice).
- A rival hunter at -2414, -18489 — eighteen kilometres outside the world.
- The server reached 9 players against a cap of 8 and locked `agentcheck` out.

Until the roster is trustworthy, no multiplayer result is trustworthy.

## The game queue, ranked

1. **The economy.** 8 deer, never closer than ~227 m, zero hides in 2.5 days.
   Every session starves. The stalk is the stated best thing in this game and
   nobody can find a deer.
2. **Refusals never state their condition** — "not steep enough" on a 258%
   slope, "gather wood" while holding wood.
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
it is the only way anyone sees this game.

## The trap this project falls into

**A function used with no import.** Five times in one day: `clamp`/`damp`,
`vitals.hurt`, `appendFileSync`, `amountText`, `SPECIES`. Invisible to
typecheck and build; only found by running the line. Grep every identifier your
new code uses before committing.

**And a clean build proves nothing.** Verify by driving the game.
