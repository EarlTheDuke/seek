# State of play — read this first, it is short on purpose

`FINDINGS.md` is 3400 lines and `DEV-NOTES.md` is 2900. Reading either cold costs
more context than the work does. This file is the current state. **Update it at
the end of every run**, and cut the closed section rather than letting this
become another archive.

Last updated: 2026-08-05, by the run that took the ladder from rung 1 to rung 4.
Everything below the ladder from the previous run still holds (the wing carry,
the applyRemote family, `STATE.md` no longer bouncing a player to the menu).

## The ladder, as it stands

**1. MAKE AN AGENT SURVIVE — GREEN.** `npm run survivalcheck`, 7/7 over a real
socket: 25 branches foraged, a fire lit, venison cooked, a meal eaten, alive at
the end of a staged night. Three separate holes, each invisible from a browser:

- **Cooking was browser-only.** `intent.craft` now names a recipe out of the
  table (closed vocabulary, checked in `sanitiseIntent`) and the server resolves
  it at a fire within `SURVIVAL.fireReach`. A NAMED recipe, not a bare "craft" —
  `bestAvailable` returns the first thing the table allows, so a body carrying
  stone, hide and firewood would have knapped an axe while its meat went raw.
- **E picked up whatever was near the FIRST player.** `Pickups.collect` takes
  what `update` last found, and `update` runs once a tick with the anchor's
  position. `collectFor` asks per person. One agent connected is exactly the
  case that hides it, and one agent is all any check had ever run.
- **A killed animal left nothing on the server's ground.** Rolled, announced,
  and the browser laid it out from the announcement — the server's own world had
  bare ground where the deer was.
- `me.iv` carries the inventory, so `brief.carrying` has stopped being a
  hard-coded empty list and a mind can reason about its own pack.
- Reflexes live in `Agent.upkeep` — eat, cook, lay a fire. Reflex not
  deliberation: nobody decides to be hungry.

**2. MAKE AN AGENT HUNT — AMBER, and honestly so.** huntcheck was 4/6 at the
start of the run and is now 3-of-4-runs green with kills at 61, 65 and 112 s
(was 1 of 4, at 103–150 s). No constants were tuned. The instrument came first
and found four things:

- The solver aimed from a **standing** eye (1.72 m) while the body **crouched**
  (1.05 m) — `stalkWithin` is 45 m, so it is always crouched. `me.e` now carries
  the live eye height.
- It **refused shots a standing archer has**: 32 refusals in one run, all
  "ground in the way", not one arrow in 150 s. It now re-solves from full height
  and STANDS UP when that clears. Ground refusals 32 → 9 → 0.
- It hunted **whatever deer came first in the packet** — id order, so regularly
  one 358 m away while four grazed at twenty. Now the nearest.
- It **lobbed at 43°** at a deer 17 m up a crag that horizontal range called
  "18 m away". Range is measured along the slant now.

**The remaining failure is TREES.** Run 1's two arrows both hit trees, which
neither `arcClearance` nor `sightline` can see, because the scatter field is not
in `heightAt`. That is the next thread — `deadfallNear` is the precedent for a
pure placement function an agent can query without a scene.

**3. MANY MINDS, MANY PROVIDERS — GREEN.** `npm run providercheck`, 25/25, with
no key and no network: a real HTTP server on 127.0.0.1 answering in both wire
shapes, asserting on the bytes that arrive.

- `ModelProvider` holds everything the two shapes share; `AnthropicProvider` and
  `OpenAiProvider` write `request()` and nothing else. xAI, Moonshot, DeepSeek,
  OpenRouter, Together, Groq, Mistral and local llama.cpp are all the second one
  with a base URL — there is a vendor table so `MINDS_PROVIDER=moonshot` works.
- **The default model was `claude-sonnet-4-5`, two generations stale.** Now
  `claude-opus-5`.
- `MINDS_ROSTER=roster.json` — see `roster.example.json`. Each line its own
  vendor, model, character, pet, orders. **Keys are NAMED (`keyEnv`), never
  written**; there is deliberately no field for a literal key.

**4. PERSONALITIES — HALF DONE.** A `character` from the roster is threaded into
that agent's system prompt and no other (was identical text for everyone). **The
scarcity half is NOT built**: wood and deer are effectively infinite, so a
hoarder and a generous soul are indistinguishable. That is the next piece of
this rung and it is a game-design change, not a prompt change.

**5. MAKE IT WATCHABLE — NOT STARTED**, but the thread to pull is there:
`Agent.deeds` is an hour-stamped record of what a body actually did, outside
`Memory`'s forty-entry ring buffer (which fills with noticing and forgets that
it lit a fire). `agent.refusals` and `agent.shots` are the same idea for the bow.

**6. MAX_PLAYERS — NOT STARTED.** Still 8, shared between humans and agents.

## For tomorrow night

```
DANGER=no-bears node server/server.js 8080
MINDS_ROSTER=roster.json npm run agents          # keys in the ENVIRONMENT
npx vite --port 5173 --strictPort
```

The header prints what is ACTUALLY about to play — a line per player, with
`(no XAI_API_KEY)` beside anyone who quietly fell back to scripted. Read it.

Staging knobs on `server.js`, all off by default: `HOURS=1` (start at 01:00),
`RAID=6` (a warband meets the first player), `STOCK=venison:2` (everybody
arrives carrying), `HUNGER=52` (everybody arrives hungry). The last two are new
and exist because survival and hunting are separate questions that could not be
asked separately — a red hunt made the whole of survival untestable.

## Checks

`survivalcheck` 7/7 · `providercheck` 25/25 · `huntcheck` 6/6 (flaky — 3 of 4)
`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · `campcheck` 36 ·
`weathercheck` 27 · `netcheck` 24 · `mindcheck`/`clockcheck` 21 · `warmthcheck` 20 ·
`deathcheck` 19 · `bookcheck`/`reportcheck` 18 · `raidcheck` 18 · `agentcheck` 17 ·
`ordercheck` 17 · `dangercheck` 12 · `herdcheck` 12 · `rendercheck` 12 ·
`spreadcheck` 10 · `bitecheck` 10 · `shotcheck` 8 · `arrowcheck`/`woundcheck` 7.

Ports: survivalcheck **8095**, huntcheck 8096, shotcheck/bitecheck 8099,
herdcheck 8098. `netcheck` and `survivalcheck` need a quiet box — netcheck's
COMPANION line fails on a loaded one and it is not a regression.

## Things that will waste your time if you do not know them

- **`arriveWithin` is 6 m and `PICKUP.radius` is 2.2.** A body walked to a
  branch, stopped four metres short, pressed E, marked it taken and walked off —
  thirty-five times, with an empty pack, and every check read that as gathering
  because it counted the presses. Targets that came to use their hands now carry
  `within`. **A tally of intents is not evidence of an outcome.**
- **`me.f` arrives at 20 Hz against a body running at 30.** It ate two steaks a
  third of a second apart, 44 → 100 with the ceiling at 100. Anything the server
  confirms needs a cooldown on this side.
- **The agent's game clock wraps at 24.** A cooldown measured in `this.hours`
  goes negative at midnight — count real seconds off `dt`.
- **`highlands.capture()` RUNS A FRAME.** Tune in the source, not the console.
- **`ctrl.yaw = x` is the same trap as `ctrl.position.set` and `warp`.**
- **Sandbox pins `feltC`/`effectiveC`/`wetness` while `coreC` keeps falling** —
  `ruleset.current.survival === false`. Set it true in place.
- **`highlands.build()` takes NO argument.** `structures.place('glider', …)`.
- **`HOURS=1` moves the spawn to the other side of the lake** (~420 m).
- **A number that reproduces exactly is a CONFIGURATION, not a drift.**
- **Kill stray processes at the END of your run.** This run left one on 8094 and
  `pkill -f` did not touch it; `netstat -ano | grep LISTENING` then `taskkill
  //PID n //F` is what works here. 8080 was occupied by somebody else's server
  all run and was left alone.
- **A KEY RELEASE YOU DO NOT STEP IS NEVER SENT**; keys go on `window`, not
  `document`; pace `stepWorld` to the wall clock; `javascript_tool` gives up at
  30 s and `const` leaks between calls.
- **NEGATIVE `ctrl.pitch` LOOKS DOWN**, pitch is damped back every step, and
  `flightHeading(yaw) = yaw + PI`.
- **Two check harnesses run back to back collide.** Re-run the loser alone.
- **`highlands.report({steps})` wants an ARRAY.**
- **Scatter colliders are `highlands.scatter.colliders`**; a creature's Object3D
  is `c.object`; lit fires are `highlands.fires.active`; `hud.heard` holds
  objects, not strings — read `h.text`.

## The queue, ranked

1. **Trees are invisible to every shot check the body makes.** Rung 2's last
   mile. `arcClearance` and `sightline` walk `heightAt` only, so an arrow that
   will hit an oak reads as a clear line. `deadfallNear` is the pattern: a pure
   placement function both ends compute from the seed.
2. **Scarcity, so personality has something to be about** (rung 4's other half).
3. **Surface each mind's intention and stated reason, live** (rung 5). `deeds`,
   `refusals` and `shots` are already the data; nothing draws them.
4. `glider.js` samples ridge lift upwind with `(−sin, −cos)` while integrating
   flight in `(+sin, +cos)`. Establish which way `wind.angle` points first.
5. **Arrows fired at ~0 m all miss.** Unexamined since the aim fix; re-measure.
6. **Nothing comes back DOWN about your own animal** — hurt, fed by somebody
   else, killed. `g` + `mirrorFight` is the pattern to copy.
7. **Crouch is a uniform Y squash of the whole avatar.** Bend the legs and drop
   `body.position.y` instead of scaling the group.

**Unmeasured, worth one run:** with 4 players the server's population drifted
68 → 37 over ~24 game minutes (cap is 120). Daybreak retiring the night shift
would explain it; so would `clearedSites`. Nobody tested which.

**Measured, not a regression:** a companion trails a CONTINUOUSLY MOVING owner
at about its own `runRange` — invisible in single player, glaring with agents.

## How to play it

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button (**Sandbox** for `warp`/`spawnPack`), then drive with
`window.highlands.stepWorld(1/60)` in REAL time. **The pane does not composite
when it is not displayed**, so `requestAnimationFrame` never fires and the world
looks frozen-but-connected; that is why `stepWorld` exists. It also reports a
**0×0 viewport**, so click the mode button from the page rather than by element
ref and check `highlands.ruleset.current.id`.

`highlands.capture('name')` writes a JPEG to `shots/` — **read those images**;
under ~5 KB means the blind-pane bug is back. `PET=<species>` on `agents.js`
gives every agent an animal (the mind is not told it exists).

## The trap this project falls into

**A name used and never defined** — invisible to build, only found by running
the line. Grep every identifier your new code uses. **And a clean build proves
nothing**: this run's build was green while `gather` had never once put a branch
in a pack. Verify by driving the game, and make the check assert an OUTCOME.
