# State of play — read this first, it is short on purpose

`FINDINGS.md` is 3400 lines and `DEV-NOTES.md` is 2900. Reading either cold costs
more context than the work does. This file is the current state. **Update it at
the end of every run**, and cut the closed section rather than letting this
become another archive.

**HOW TO READ IT.** Everything down to "The queue, ranked" is the state of play
and the next thing to do — that is the ~100 lines the brief asks for. Below it,
"Things that will waste your time" is a standing trap list rather than news, and
it is the most expensive knowledge in the repo: every entry cost somebody a
wrong diagnosis. **Skim it before you debug anything, not after.** It is kept
here rather than cut because a closed bug can be deleted and a trap cannot.

Last updated: 2026-08-06, by the run that answered the ceiling question with an
8-run A/B — and found the sentinel built to police that A/B was blind in exactly
the case that mattered.

**IF YOU READ ONE THING: `shootRange: 26` IS RIGHT. DO NOT RAISE IT.** Measured,
not argued: raising it to 40 m TRIPLES the time a body spends with a deer inside
its own rule (12% → 44% of a run) and converts almost none of that into arrows
(1.9 → 2.8 per 100 s). What it converts into is REFUSALS — "ground in the way"
goes from 3.3 to 23.7 per 100 s, a SEVENFOLD rise — and kills went 3/4 to 2/4.
**The ceiling was never the binding constraint on the shot rate. The ground is.**

That closes the first paragraph of the old queue item 1 with evidence, and it
confirms on measurement what `config.js:827` had only ever asserted from one
run's anecdote.

**AND THE SECOND FINDING IS THE CONTROL COLUMN, WHICH NOBODY HAS READ ON ITS
OWN FOR SEVERAL RUNS: AT THE SETTINGS THAT SHIP, THE BODY KILLS.** 3 of 4
control runs brought a deer down in 42-77 s, a fifth default run did it in 52,
and the "shot rate is the whole tail" framing that has led the queue for two
runs was generalised from the RED runs. The hunting needs nothing for the
evening. See below before spending another run on it.

## THE CEILING A/B — 4 seeds, 2 arms, and the arms were provably different

`SHOOTRANGE=40 HUNTSEED=corrie npm run huntcheck`. Unset is `AGENTS.shootRange`
and the literal 'huntcheck' seed, byte for byte — the ceiling is an ARM in the
check, never an edit to `config.js`.

| per 100 s of hunting | reach 26 | reach 40 |
|---|---|---|
| time a deer is inside the rule | **12.3%** | **44.0%** |
| **arrows loosed** | **1.9** | **2.8** |
| wounds | 0.8/run | 1.0/run |
| **kills** | **3/4 runs** | **2/4 runs** |
| refusals, all reasons | 11.6 | 34.8 |
| **…"ground in the way"** | **3.3** | **23.7** |
| …"a tree in the way" | 2.8 | 6.6 |

**READ ROWS 1 AND 2 TOGETHER.** 3.6× the opportunity bought 1.5× the arrows.
Everything else the extra reach bought was deliberation about shots the ground
would not allow — which is, word for word, the argument `config.js` gives for
cutting the number from 45 in the first place. `braemar-r40` is the picture:
**110 seconds with a deer inside 40 m, 27 refusals, and not one arrow.**

**Per seed, so nobody quotes the mean as if it were four agreeing runs.** Arrows
went 3→0, 1→1, 1→10, 1→2 — the mean is carried almost entirely by one run, and
a re-run of that same seed and arm later gave 2 arrows, not 10. In-range time is
the robust effect (28→74, 9→8, 7→55, 5→39); the arrow count is not. **Treat the
arrow row as suggestive and the refusal row as the finding.**

**THE ARM SENTINEL READ CLEAN**, which is why the table is worth anything: the
furthest arrow on the four control runs was 24.5, 24.9, 21.4 and 21.7 m — under
26 by construction — and on the treatment 39.4, 39.7 and 39.8. Two A/Bs in this
project have run the same arm twice; this one did not.

### AND THE CONTROL ARM IS THE BURIED LEAD: AT THE SHIPPING SETTINGS IT KILLS

Read the control column on its own, which nobody has done for several runs. **It
killed a deer in 3 runs of 4, in 42, 55 and 77 seconds**, on one or two arrows,
with a refusal rate of 11.6 per 100 s. A fifth default run taken afterwards
killed in 52 s. That is 4 of 5 recent default runs bringing an animal down
inside about a minute.

**So "the shot rate is the whole tail" was diagnosed off the RED runs**, and the
last two runs' worth of queue text has been aimed at a body that, at the
settings that actually ship, feeds itself. The failure is not general: it is
SPECIFIC SCENARIOS. `braemar` failed on both arms and is the one worth studying
— deer at a median 37 m, 48 refusals, 20 ground and 17 timber, three arrows,
three wounds and no kill.

**For the evening this means the hunting is fine and needs nothing.** For the
queue it means: stop sampling the mean, and go and look at the scenario that
fails. `HUNTSEED=braemar` reproduces one.

## …AND THE SENTINEL POLICING IT WAS BLIND WHEN THE TREATMENT WORKED

It printed *"0 of 0 arrows — no arrows, so this run says nothing about the arm"*
on a run that loosed an arrow AND wounded a deer with it, with `agent.arrows`
reading 1 four lines away on the same page.

It counted slants out of `agent.shots`. **`shots` is pushed only by
`howItMissed`, which only ever runs off a `miss` event** — and a `wound` sets
`lastShot = null` because there is no miss left to measure, so an arrow that
goes home never lands there. `shots` is the MISSES. The sentinel could therefore
see the arm ONLY when the arm failed, and reported the treatment unproven every
single time the treatment succeeded.

Sixth instrument in this project to report something it had not measured, and
the first to fail in the direction that HIDES A SUCCESS. `Agent.loosed` is now
written at the moment of RELEASE — one entry per arrow, before anything can
happen to the shaft, bounded like `refusals` — the sentinel reads that, prints
every arrow by slant, and cross-checks its own length against `agent.arrows`
from the other code path so a third failure announces itself.

## …AND THE COUNTS IT PRINTS ARE OVER DIFFERENT AMOUNTS OF TIME

**huntcheck STOPS ON A KILL.** A run that kills ends at 36-77 s; a run that does
not runs the full 150. So every raw tally in it is a count over a denominator
that depends on the OUTCOME, and comparing two arms on raw counts rewards the
arm that fails, for taking longer to fail. Read straight, this A/B's control
looked like it refused a third as often (14.3 against 43.5); per second it was
11.6 against 34.8. The check now prints the rate, the run's length and the
arrows on one line so the comparison cannot be got wrong again.

## STILL TRUE FROM THE RUN BEFORE: `DETOUR=close` — a step aside that closes the range

`clearSpotNear` offered candidates ONLY perpendicular to the line of sight, so a
step aside held the range exactly — worse, a 6 m step at 24 m LENGTHENS the slant
to 24.7. A candidate may now also move UP the line of sight: `along =
min(AGENTS.detourAdvance * |step|, d − AGENTS.standOff)`, clamped so a sidestep
cannot do what closing is forbidden to do. The flats are still tried AFTER the
diagonals, so the candidate set is a strict SUPERSET and `nowhere to go` can
only fall.

**Why it should work, in one line:** distance to a point is convex along a
straight line, so the greatest range over a walk is at one of its ends. A spot
nearer than where the body stands means the slant never exceeds where it already
was.

Flag-gated `DETOUR=close`, composable: `DETOUR=commit,close`. **Default OFF and
byte-identical** — `advance: 0` is the old six candidates in the old order, and
detourcheck asserts that spot for spot as well as tick for tick.

## IT WORKS — and this is the number that matters

Pooled over 4 huntcheck runs an arm, alternating, `commit` against `commit,close`:

| | commit | commit,close |
|---|---|---|
| closed detour episodes | 7 | 14 |
| **ended with a shot** | **1 (14%)** | **4 (29%)** |
| **…and those walked** | **0 m** | **3, 3, 3, 7 m** |
| `too far` share | 4 (57%) | 5 (36%) |
| range closed (M < N) | 3/7 (43%) | 10/14 (71%) |
| stepped up the line | 0/7 | 14/14 |
| m walked per detour | 1 | 2 |
| deer killed | 4/4 | 3/4 |

**READ THE SECOND AND THIRD ROWS TOGETHER.** The control's one "success" walked
**0 m** — which the instrument itself flags as the line clearing on its own, not
the step. All four of the closing arm's successes walked 3-7 m and one recorded
`arrived`. **That is the first evidence in this project that a step aside
produces a shot BY STEPPING.** Every previous green was the geometry resolving
itself while a detour happened to be open.

The control lines read `24 m -> 24 m` and `27 m -> 27 m` — the range preserved
to the metre, which is the geometric claim confirmed in the field.

**Metres walked per detour did NOT climb to the 6-20 m the queue predicted.**
Still 2 m, because 8 of 10 episodes still end inside 0.7 s. Kills went 4/4 to
3/4, which is noise: huntcheck is red about a third of the time, and the one
closing failure was a run with 10 detours — a harder scenario, not the same one
failing. **The arms did not face identical worlds**; real-time jitter changes the
trajectory, and run 1 of each arm diverged completely (0 detours vs 10).

## AND THE THING IT WAS AIMED AT WAS NEVER A BUG

`too far` ended detours with the deer at **20-23 m against a 26 m `shootRange`**,
which is impossible on horizontal range alone. Two mechanisms could do it and
they want OPPOSITE fixes, so `aimAt` now hands back `slant`, `dy` and `leadBy`
with the refusal and huntcheck prints them one per line.

**Measured immediately, and it is not close: 9 of 9 are THE CLIMB.**

```
  deer  23 m away, arrow must fly    26 m  (+12.6 m of climb,  0.1 m of lead)
  deer  45 m away, arrow must fly  56.6 m  (+17.9 m of climb,  8.7 m of lead)
  deer  21 m away, arrow must fly    27 m  ( -8.4 m of climb,  4.7 m of lead)
```

`shootRange` is a SLANT limit because the range that matters is the one the arrow
flies. So a 27 m shot under a 26 m rule is **honestly refused**, and `too far`
ending a step aside is the body deferring the sidestep until the animal is in
range and closing instead — which is what it should do.

> **DO NOT BUILD the queue's old option (b)** ("do not let `too far` end a
> committed detour"). It would force the body to walk to a firing position for a
> shot it cannot take. The old queue text called it "cheaper still"; it is wrong,
> and it is only knowable from the three numbers above.

Note the lead hypothesis was the *plausible* one — a deer at 14 m/s earns ~6 m of
lead at that flight time — and it was wrong. Printing beat arguing again.

## WHAT A BODY LOOKS LIKE — four fixes, found by LOOKING

Driven as a real browser client against a real server, then measured. All four
were live in the game and none of them broke a single check.

**1. The crouch squashed the HEAD and the NAME.** `avatars.js` did
`object.scale.y = lerp(1, 0.72, crouch)` on the whole Group. For a torso and
legs that is a cheap, good crouch and it stays. The head is not a limb — 72% is
a head that has been stood on — and the nameplate is a **text sprite**, so the
one thing on screen whose whole job is to be read got 28% harder to read exactly
when somebody is sneaking toward you. Both counter-scaled; they still travel
DOWN, they just stop deforming.

**2. Every PvP kill was "killed by the cold".** `onPlayerDied` read
`killer?.species?.name ?? 'the cold'`. A creature has `.species.name`; a PLAYER
— which is exactly what the arrow path hands it — has `.name` and no `.species`.
**With six models shooting at each other tomorrow night that is every
interesting death in the run, told wrong.**

**3. The palisade was a picture of a wall.** `colliders.add?.()` — and
`ColliderField` has `addSphere`/`addCylinder`/`addBox` and has NEVER had an
`add`. The `?.` swallowed it in silence and arrows flew through. The arguments
were right all along; one method name.

**4. ...AND `campcheck` SAID IT WAS FINE.** It asserted `built.some(b =>
b.collided)` — a flag set on the line AFTER the dead call, unconditionally, with
no way to fail. Now it asserts the cylinder itself, tagged, at the spec's radius.
**A flag that says work happened is not the work.**

**5. ...AND MAKING THE WALL REAL MADE IT IMMORTAL.** Caught by asking what
else changed, not by a check. `Structures.remove` knew nothing about the
collider and `ColliderField` had no way to remove one, so a wall you built and
took down would stop arrows for the rest of the run — impossible before, because
no wall was ever solid. Colliders are now RETIRED, not spliced: `grid` holds
INDICES into `list`, so removing an entry would renumber every solid after it.
campcheck asserts it through a LIVE SEGMENT QUERY, because a retired collider is
still in the list by design and a check that counted would pass on a live wall.

### `avatarcheck` — 11/11, no port, no server, no wall clock

Drives the REAL `Avatar.apply`. The only fake is a DOM stub for the nameplate
canvas; the figure is built by the real constructor. **It measures WORLD scale,
not local, and that is the entire point** — the head's own `scale.y` reads
exactly 1.0 the whole time its parent is crushing it, so the local number proves
the bug absent while you are looking straight at it. Counterfactual 10/11.

It also pins two things nothing covered: a dead body tips 90° and hides its name,
and you can see somebody else draw a bow.

## THE LLM FLEET IS BUILT — everything but the key (see LLM-PLAN.md)

**A real Claude call would have returned the SCRIPTED brain on every single
request, silently, while the header printed the model as playing.** Opus 5 runs
adaptive thinking when the `thinking` field is absent — changed from Opus 4.8 —
so `content[0]` is a THINKING block and `data.content[0].text` read `undefined`.
That is fixed, and four more phases went in behind it.

| | |
|---|---|
| the wire | reads EVERY text block; states `thinking`/`effort`/`max_tokens` out loud; names refusals and truncations |
| failure is LOUD | `mindHealth` per card, `N FAILED` on the live line, a one-time alarm per agent |
| the roster | `think`/`effort`/`cadenceSeconds` per seat; `roster.example.json` ships |
| conversation | `AGENTS.hears` 8 into the brief (was 3), and the prompt now says WHEN to speak |
| rate limits | named errors, ONE bounded retry, a refused key is never retried |

**Proved live in a browser**: a card reading `claude-opus-5` with
`SCRIPTED — 11/11 failed` beside it, driven by pointing the fleet at a dead
endpoint. That is the whole point of Phase 2 and it works.

**The persona control moved TWICE, deliberately and recorded in personacheck**
— an XML-tag guard (thinking-disabled models can leak tags into the answer) and
the when-to-speak lines. Both go to control and personas identically.

**Open, and both need a key or a clock:** the `say` gate is unmeasured (0.4 GAME
hours — measure before tuning), and a `say` still costs the agent its turn.
## The instruments, cumulative

- **`slant`/`dy`/`leadBy` on a `too far` refusal**, printed one line per refusal
  and never averaged, with a self-indictment: a refusal whose slant is UNDER
  `shootRange` means the instrument is wrong, and it says so.
- **`along` on every detour episode**, and huntcheck refuses to be read quietly:
  it prints "CLOSING IS ON AND NOT ONE DID: distrust this run" and the converse.
  **This is the arm sentinel** — it proves which code was loaded from the DATA
  rather than from the env var, and this project has twice believed an A/B that
  was running the same arm twice. It read 0/7 and 14/14. The arms were real.
- **the `too far` share and the range-closed count printed as NUMBERS**, not left
  derivable. The last finding sat unread in this block for a run and a half
  because it was derivable and nobody derived it.
- **detour episodes** (`openDetour`/`walkDetour`/`endDetour`): one obstruction,
  one decision, one named outcome, ground WALKED against NET displacement and
  sign-flips. Prints its own arithmetic and says so if the books do not balance.
- **`resolves`/`held`/`dropped`** per episode, **`detourAsked`/`detourNone`** per
  TICK with the blocker named, the wound event's `i: creature.id`, and
  `leadBy`/`dropTo` in the miss table.

## `detourcheck` — 18/18, no port, no server, no wall clock

**The one check here that is not real-time, on purpose**, and the only one you
can run on a busy box and believe. It drives the real `Agent.prototype` over real
terrain at **24 sites found by scanning**, not pasted in as coordinates.

It reproduces the bug with the deer **STANDING STILL**: on the default arm the
step aside walks the body from 22 m out to **25.5 m** — into the 26 m ceiling —
on 23 of 24 sites. Closing ends those same walks at **15.1 m** and opens the
range on 2. Six new assertions cover the spot being nearer, the stand-off floor,
the superset property, the range never rising over the walk, and `advance: 0`
being the old candidate set spot for spot.

**The counterfactual: 18/18 -> 15/18** with the diagonals disabled in the real
code, and exactly the three mechanism assertions fell. It also put a number on
the original claim — with diagonals off a step aside LENGTHENS the range by a
mean 3.1 m. (Commit first, mutate, run, `git checkout --`, then grep to prove the
probe is gone AND the real code is back.)

## Theories that died, and one of them was mine this run

Every one measured, not argued. Print the number before you act on any of these.

| theory | what the instrument said |
|---|---|
| **`too far` is a bug to be fixed** | **it is the CLIMB, 9 of 9, and the refusal is correct** |
| **the lead is what puts a 20 m deer out of a 26 m bow** | lead is under 1 m in 6 of 9; climb is 6-18 m |
| **closing will move the kill rate** | 4/4 -> 3/4. It moved the DETOUR outcomes, not the kills |
| committing to the detour will move the kill rate | 4/8 both arms — fixed its flicker, changed nothing downstream |
| the flicker is what stops the walk completing | it stops 13-17% of TICKS; `too far` stops 50-57% of EPISODES |
| the detour walks sideways FOR EVER / orbits | 0-7 m, 0-2 sign flips. No orbit, no livelock |
| `clearSpotNear` finds nowhere to go | 87% on ground, 100% on timber (35% null on one later run) |
| ground in the way throttles the shot rate | blocked sightlines are ~10 s of a 150 s run |
| it thrashes between deer (`resolve` picks NEAREST) | 0-5 swaps/run, longest unbroken stalk 46-86 s |
| it abandons the animal it wounded | stayed on it 65 of the 72 s after the arrow |
| the lead is over-projecting (3 of 3 arrows LEFT) | `aimed 0.2 m ahead`. Velocity is already clamped at 14 m/s |

## What separates a green run from a red one

**Every green run put ONE arrow into ONE deer and ate** — kill in 53-72 s, one
animal. **Every red run's arrows went HOME** — `vsModel` 0.0-0.5 m, the aim is
not the problem — and banked one or two wounds without a kill.

**Shot RATE is still the whole tail.** The body is inside `AGENTS.shootRange` for
**5-14% of a run**, and nothing this run or last run changed that.

## CLOSED EARLIER, kept to three lines each

**The bow is understood** (`ballisticscheck` 7/7, port 8088): median **0.17 m**
from its own model out to 151 m, and the one real bias — `Bow.fire` spawns the
shaft 0.55 m down the aim line while every model launched from the eye — is fixed
as `BOW.muzzle`. The phantom "arrows land long" was geometry.

**A body can say it picked something up** (`Agent.notePack`) and **a craft deed
is no longer a keypress** (`Agent.noteMake`) — `World.update` refuses a craft in
total silence. Both proved red as well as green; `survivalcheck` 12/12.

**The miss table measured the wrong thing** for three sessions: `across` is
against the LEAD-ADJUSTED mark, so it structurally could not see a mis-lead.
`leadAcross`/`leadAlong` put the DEER's own position into the shot-line frame.

## THERE IS A BOARD. `BOARD=on npm run agents` -> http://127.0.0.1:8090

One card per mind, repainting once a second: who it is, what model, which persona
(hover the tag), what it is doing, WHY, how its body is, what is in its pack —
and four threads of which only the first was ever visible, through chat:

  meant · did · went astray · would not shoot

**"would not shoot" is the best line on the page.** Off by default, loopback
only, cannot kill the run hosting it. `boardState` is pure (agents in, JSON out)
so the check builds boards from invented agents too. `boardcheck` **35/35, and it
discriminates — 27/31 with three fields broken.**

## THE LADDER IS DONE. All six rungs green.

**1. SURVIVE** `survivalcheck` 12/12 — forage, light, cook, eat, live the night.
**2. HUNT** `huntcheck` kills in 53-102 s when it kills, on one arrow. **DO NOT
TUNE CONSTANTS**: three passes of that moved the failure around, and every real
mechanism since has been found by measuring EPISODES and their named OUTCOMES.
**3. MINDS & PROVIDERS** `providercheck` 25/25. One OpenAI-compatible provider
plus Anthropic; `MINDS_PROVIDER/BASE_URL/MODEL/API_KEY`, per-agent overrides in a
roster file. Proved against a local fake endpoint — no key needed to test.
**4. PERSONAS** `personacheck` 21/21. `PERSONAS=off|on|hoarder,liar,…`; OFF is
byte-identical and the check asserts the BYTES. **`SCARCE=0.7,0.5` is the gentler
setting if a full roster starves.**
**5. WATCHABLE — both miles.** `NARRATE=on` (`watchcheck` 10/10); `BOARD=on`
(`boardcheck` 35/35).
**6. A FULL ROSTER** `MAX_PLAYERS` 16, measured: 60 Hz tick unmoved at 12 and 16,
56-65 KB/s per client. The TICK is not the ceiling, the WIRE is — everybody is in
everybody's snapshot, so the total grows with the SQUARE of the roster.
`node server/rostercheck.js 8091 24` before anybody promises thirty-two.

## For the evening itself

```
DANGER=no-bears SCARCE=on node server/server.js 8080
MINDS_ROSTER=roster.json PERSONAS=on NARRATE=on BOARD=on npm run agents  # keys in the ENVIRONMENT
npx vite --port 5173 --strictPort
```

**Put http://127.0.0.1:8090 on the second monitor** and play in the first. The
chat column tells you what, the board tells you why, and only the board keeps it
on screen long enough to read.

The header prints what is ACTUALLY about to play — a line per player, its model,
its character, and `(no XAI_API_KEY)` beside anyone who quietly fell back to
scripted. Read it. Other knobs, all off by default: `HOURS=1`, `RAID=6`,
`STOCK=venison:2`, `HUNGER=52`, `DETOUR=commit,close`.

**`DETOUR=commit,close` is safe for the evening and is now mildly RECOMMENDED**,
which `commit` alone never was. It is the only configuration in which a step
aside has been seen to walk somewhere and produce a shot, and a hunting body
working its way round a knoll toward a deer is worth more on camera than one
sidestepping in place. It did not raise the kill rate; nothing yet has.

## Checks

`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · **`campcheck` 38** ·
`boardcheck` 35 · `weathercheck` 27 · `netcheck` 24 ·
`providercheck` 38 · `personacheck` 21 · **`avatarcheck` 11** · `mindcheck`/`clockcheck` 21 · `warmthcheck` 20 ·
`deathcheck` 19 · `bookcheck`/`reportcheck`/`raidcheck` 18 · **`detourcheck` 18** ·
`timbercheck` 17 · `agentcheck` 17 · `ordercheck` 17 ·
`dangercheck`/`herdcheck`/`rendercheck` 12 · `survivalcheck` 12 · `bitecheck` 10 ·
`spreadcheck` 10 · `watchcheck` 10 · `refillcheck` 9 · `scarcecheck` 9 ·
`shotcheck` 8 · `huntcheck` 7 · `arrowcheck`/`woundcheck` 7 ·
`ballisticscheck` 7 · `rostercheck` 6 · **`rangecheck` 9 (port 8087)**.

**`huntcheck` now takes two arms**: `SHOOTRANGE=40` raises the ceiling for that
run only (`config.js` untouched) and `HUNTSEED=corrie` changes WHICH SCENARIO —
the seed here was a hardcoded literal, so four runs were never four samples.
Unset, both are byte-identical to what they were. Read the REACH SENTINEL before
believing any reach comparison, and read the `/100s` column, not the counts.

Ports: **ballisticscheck 8088**, boardcheck 8093 (plus 8090 for its own board and
8089 for the fleet's), rostercheck 8091, watchcheck 8092, scarcecheck 8094,
survivalcheck 8095, huntcheck 8096 (**takes a port argument: `node
server/huntcheck.js 8096`**), refillcheck 8097, herdcheck 8098,
shotcheck/bitecheck 8099. The board's own default is **8090**. `refillcheck` walks
a real body about 1.3 km and takes roughly four minutes. `netcheck` and
`survivalcheck` want a quiet box. **ballisticscheck spends the whole twelve-arrow
quiver and takes about three minutes.**

## Known red, and honestly so

- `netcheck` "it went with her" (a companion trailing a continuously moving
  owner) is the long-known load-sensitive one.
- `huntcheck` — **7 green of 8 across this run's A/B**, four runs an arm, on a box
  that was NOT quiet: five `node.exe` were already running and one of them owns
  8080. They were left alone rather than killed, so read the rate accordingly.
- **The A/B's effective sample is smaller than "4 runs an arm" sounds.** The seed
  is fixed (`makeRandom('huntcheck')`), so runs differ only by real-time jitter:
  `commit` runs 2/3/4 were near-duplicates (all 72 s kills, 2-3 detours) and
  `close` runs 2 and 4 were identical twins. Call it 2-3 distinct scenarios an
  arm. **Vary the seed before trusting any rate from this check.**

## The queue, ranked

1. **THE SHOT RATE — and the two constants people reach for are now BOTH ruled
   out, on measurement.** The body is inside `AGENTS.shootRange` for 5-14% of a
   run and every mechanism fixed in the last four runs has left that untouched.

   **THE BOW IS NOT IT.** `rangecheck` (port 8087, 21/21): a standing deer is hit
   at every band from 12 m to 52 m, median 0.10 m from the chest, and led at a
   trot 11 of 12. So `shootRange` was never a marksmanship number.

   **AND THE CEILING IS NOT IT EITHER, and this is the new one — DO NOT RAISE
   IT.** The 8-run A/B at the top of this file gave the body 3.6× the in-range
   time and got 1.5× the arrows, a 7× rise in "ground in the way" refusals, and
   fewer kills. `SHOOTRANGE=` stays a measuring arm; `config.js` stays at 26.

   **AND CHECK THE PREMISE BEFORE SPENDING A RUN ON IT.** The control arm killed
   3 of 4, plus a fifth default run at 52 s — 4 of 5 default runs kill inside
   about a minute. The shot-rate problem was diagnosed off the RED runs and
   generalised. **This is no longer the top of the queue on the evidence; it is
   here because it is written down, not because it is hurting.**

   **IF IT IS PICKED UP, GO AT A FAILING SCENARIO, NOT THE MEAN.**
   `HUNTSEED=braemar` reproduces one that fails on both arms: 48 refusals, 20
   ground and 17 timber, three arrows, three wounds, no kill. And the untouched
   number to start from is `clearSpotNear` answering NOWHERE TO GO on **52-54%
   of the times it is asked** (718 ground asks, 390 null, in one run) — printed
   by huntcheck for several runs and never once chased. Ruled out already, do
   not re-derive: an obstruction beyond the target is impossible, because
   `sightline` iterates `s` from 0.05 to 0.98, strictly between eye and mark.

   **Do not start another detour fix, and do not tune a constant.** The detour is
   understood and closed; three passes of constant-tuning moved the failure
   around without fixing it, and the two constants left have now each been
   measured and cleared.

2. **NOTHING COLLIDES WITH ANYTHING. A body is a POINT that samples the height
   field.** Established this run by reading every line of the movement path, and
   it is the biggest single gap in the game. **Not started deliberately** — it is
   feature-sized, it touches the core movement path on BOTH client and server,
   and half-landing it is worse than leaving it.

   `controller.js:174-175` is the entire horizontal step: `position.x +=
   velocity.x * dt`, same for z, and **nothing follows** — no sweep, no push-out,
   no radius test, no `blocked` flag. Its own header says so at
   `controller.js:4-6`. The only solid in the player's world is `heightAt`, plus
   a soft wade clamp for water.

   So a player walks through **tree trunks, crowns, rocks, boulders, landmark
   stones, every built structure, every creature, and every other player.**
   Confirmed both ways: `ColliderField` has no point or capsule query at all —
   only `segmentHit`, which exists for ARROWS — and the creature separation pass
   (`manager.js:859-894`) iterates `this.creatures`, which never contains a
   player. The one player-vs-player geometric test in the repo is the arrow
   capsule (`sim/world.js:312-320`, `PLAYER_RADIUS 0.42`), and those constants
   appear nowhere else. The spawn fan-out (`sim/world.js:353-363`) keeps two
   arrivals from spawning inside each other and lasts exactly one frame.

   **FOR THE EVENING THIS IS COSMETIC-BUT-LOUD**: six bodies and a human will
   walk through each other and through trees on camera. **Decide whether it is
   worth it BEFORE building it**, because the risks are real — it is on the
   server tick and the client prediction path, so it is a determinism surface,
   and `agent.js` already *routes* round trees for shooting (`timber()`), which
   would start fighting a physical constraint it has never had to respect.
   If it is built: flag-gated, default OFF, and a socket check that asserts two
   bodies cannot end a tick inside one another.
3. **`p.lastCraft`** (world.js:911) is written on every successful craft and read
   by nothing — a confirmed-make signal already on the server, if anyone wants it
   on the wire rather than inferred from the pack.
3. `glider.js` samples ridge lift upwind with `(−sin, −cos)` while integrating
   flight in `(+sin, +cos)`. **Half answered: a BODY walks along `(−sin yaw, −cos
   yaw)`, measured on the server four ways.** Whether `wind.angle` means "blowing
   toward" or "coming from" is still unestablished, and that is the half that
   decides the sign.
4. **Arrows fired at ~0 m all miss.** Unexamined since the aim fix.
5. **Nothing comes back DOWN about your own animal** — hurt, fed, killed.
6. **Crouch is a uniform Y squash of the whole avatar.**
7. **An arrow that outlives `ARROW.maxFlightTime` is spliced out with NO
   `onMiss`** (projectiles.js:205). Nothing observed it, but a mind that shoots
   into the sky would never learn that it did.
8. **A shot solved at 3.04° pitch for a deer 19.9 m away**, our own model saying
   it would come down at 93.4 m, and it hit a tree 37.8 m from there. Seen ONCE,
   on a steep downhill shot. Not chased because one arrow is not a finding — but
   if `dropTo` shows up large on the next few, it is `solvePitch` on steep ground.
   **This run's climb finding makes it likelier**: steep ground is everywhere.
9. **The 68 → 37 creature drift — measured, and BENIGN.** It tracks how spread out
   people are, not a leak. Only reopen if a hillside goes quiet in play.

## How to play it

Join at `http://localhost:5173/?join=ws://127.0.0.1:8080&name=Claude&danger=no-bears`,
click a mode button (**Sandbox** for `warp`/`spawnPack`), then drive with
`window.highlands.stepWorld(1/60)` in REAL time. **The pane does not composite
when it is not displayed**, so `requestAnimationFrame` never fires and the world
looks frozen-but-connected. It also reports a **0×0 viewport**, so click the mode
button from the page rather than by element ref and check
`highlands.ruleset.current.id`. `highlands.capture('name')` writes a JPEG to
`shots/` — **read those images**; under ~5 KB means the blind-pane bug is back.

## The trap this project falls into

**A name used and never defined** — invisible to build, only found by running the
line. Grep every identifier your new code uses. **And a clean build proves
nothing**: one run's build was green while `gather` had never once put a branch
in a pack. Verify by driving the game, and make the check assert an OUTCOME.

## Things that will waste your time if you do not know them

- **AN INSTRUMENT CAN BE BLIND IN EXACTLY THE CASE THAT MATTERS, AND SAY
  "UNPROVEN" INSTEAD OF "WRONG".** The reach sentinel counted arrows out of
  `agent.shots` — which is pushed only by `howItMissed`, off a `miss` event, so
  it holds the MISSES and nothing else. A `wound` sets `lastShot = null`. So it
  could see the treatment only when the treatment FAILED, and printed *"0 of 0
  arrows, so this run says nothing about the arm"* on a run that loosed an arrow
  and drew blood with it. **A sentinel that fails toward "no evidence" is worse
  than one that fails loudly, because nobody re-runs it.** Cross-check every
  instrument against a counter from a DIFFERENT code path — `agent.arrows` sat
  four lines away on the same page reading 1.
- **A CHECK THAT STOPS ON SUCCESS HAS A DIFFERENT DENOMINATOR PER ARM.**
  huntcheck ends on a kill, so a run that kills is 36-77 s and a run that does
  not is 150. Comparing raw tallies across arms **rewards the arm that fails**,
  for taking longer to fail: this run's control read 14.3 refusals against 43.5
  and per second was 11.6 against 34.8. Divide by the run's own length. Third
  time this project has been bitten by two counts with different denominators.
- **A STRING FROM `.toFixed()` IS TRUTHY, SO `x || fallback` NEVER FIRES.**
  `secs` is `"0"` on a sub-second run — truthy — and the guard sails past it
  into a divide by zero. Coerce before you guard.
- **A `broken`/`failed` FILTER MATCHED AGAINST PROSE MATCHES THE PROSE.** A
  grep for "this instrument is wrong" flagged all 8 runs of the A/B as broken,
  because that exact phrase is in the ORDINARY `too far` breakdown as a
  self-indictment clause. Match the alarm line, not a phrase inside it. Fourth
  false reading in this project from a loose string filter.
- **A FLAG THAT SAYS WORK HAPPENED IS NOT THE WORK, and `?.` HOLDS THE DOOR
  OPEN.** `colliders.add?.()` — no such method, ever — silently did nothing for
  months while `s.collided = true` on the NEXT line announced success, and
  campcheck asserted that flag. Assert the artefact: the cylinder, in the field,
  tagged, at the radius asked for.
- **MEASURE WORLD TRANSFORMS, NOT LOCAL ONES.** A child being crushed by its
  parent reports its own `scale.y` as exactly 1.0. Reading the local number
  proves a bug absent while you are looking straight at it.
- **COMMIT BEFORE YOU MUTATE FOR A COUNTERFACTUAL.** `git checkout -- <file>`
  on a tracked file with UNCOMMITTED work throws the work away too, not just the
  probe. Cost the crouch fix once this run; it had to be retyped.
- **A DEFAULT YOU DID NOT SET IS A DEFAULT THAT CAN CHANGE UNDER YOU.** Claude
  Opus 5 runs adaptive thinking when the `thinking` field is absent; Opus 4.8 ran
  none. The same request body meant opposite things on two models one version
  apart, and the symptom was every call silently returning the scripted brain
  while the header named the model. **State the posture on every request.**
- **`content[0]` IS NOT THE ANSWER.** With thinking on, block zero is a THINKING
  block and `.text` is `undefined`. Filter for `type === 'text'` and join. This
  cost the entire LLM integration and raised no error anywhere.
- **A FIXTURE MISSING A FIELD THE REAL API ALWAYS SENDS PASSES FOR THE WRONG
  REASON.** mindcheck's payloads had no `type` on their content blocks, so its
  "a rubbish reply falls back" assertion was green because the field was ABSENT,
  not because the reply was rubbish.
- **AN `export` INSIDE `boardHtml()`'s TEMPLATE LITERAL IS NOT AN EXPORT** — it
  is page text, and `export` in a plain `<script>` is a syntax error that breaks
  the entire board while every check stays green. Same trap as the `//` comment
  in that string, new clothes. The card is browser-side; assert it from source.
- **`new URL(...).pathname` PERCENT-ENCODES THE SPACES** in this repo's own path
  and node cannot open the result. Use `fileURLToPath`.
- **BUILD AN ARM SENTINEL INTO THE OUTPUT — a number that is 0 on one arm and N
  on the other BY CONSTRUCTION.** huntcheck prints "`along` was 0 of 7" on the
  control and "14 of 14" on the treatment, and says *"CLOSING IS ON AND NOT ONE
  DID: distrust this run"* when they disagree. It proves which code was loaded
  from the DATA, not from the env var you believe you exported. Two A/Bs in this
  project have run the same arm twice; this costs three lines and ends it.
- **huntcheck's SEED IS FIXED (`makeRandom('huntcheck')`), so four runs are not
  four samples.** Runs differ only by real-time jitter, and in this run's A/B
  three of four control runs were near-duplicates (all 72 s kills) and two of the
  treatment runs were identical twins. The effective sample was 2-3 scenarios an
  arm, not 4. **Vary the seed before quoting any rate off this check.**
- **A REFUSAL CAN BE CORRECT.** `too far` ended the majority of every step aside
  and was written up as the bug to fix; it is a deer 6-18 m above the eye and a
  `shootRange` that is a SLANT limit, so the shot genuinely was not there. A
  whole queue item was aimed at forcing the body to ignore it. **Before fixing
  the commonest failure, check it is a failure.**
- **ASSERT THE COUNTER THAT REACHES A HUMAN, NOT THE ONE YOU FIND CONVENIENT.**
  `detourSpot` kept two: a body-global tally and a per-episode one. The check
  asserted the global; huntcheck PRINTS the episode's. The uncommitted path
  incremented only the global, so a live A/B reported **"1.0 solves per detour"
  for the arm that re-solves thirty times a second** — the seed value, wrong in
  the direction that flattered the change, which is the worst direction. Fifth
  instrument in this project to report something it had not measured.
- **RUN THE COUNTERFACTUAL BEFORE YOU BELIEVE YOUR OWN GREEN.** Disabling
  `commitDetour` in the real code took `detourcheck` from 12/12 to 4/12 and
  caught two assertions that were **passing on nothing**: "every held tick names
  the same place" was true of ZERO held ticks, and the arrival test was an `||`
  a body that never arrives satisfies. Neither would ever have failed on its own.
- **THE OUTCOME TALLY WAS PRINTING THE ANSWER FOR A RUN AND A HALF.** This run's
  whole finding — `too far` ends the majority of detours — came out of a block
  huntcheck had been printing since the previous run. Nobody read it, because
  everybody was reading the averages above it. **Read every line of your own
  instrument's output before you build anything to add to it.**
- **A TRANSITION COUNT IS NOT A TICK COUNT.** "23 ground refusals against 2
  detours" reads as a 90% null rate and is nothing of the kind: both numbers
  count STATE CHANGES, and measured per tick the null rate is 13%. An inference
  from two counts with different denominators cost a whole theory this run, in a
  session whose entire lesson was not to infer mechanisms from aggregates.
- **A GROUND IMPACT IS NOT A MISS DISTANCE.** The mark is a chest 0.75 m up; the
  shaft lands on the dirt. At a two-degree descent that is **ten to fourteen
  metres of overshoot built into every honest shot**, and it SHRINKS with range
  as the descent steepens. Read `vsModel`. The yardstick is printed at the end of
  `ballisticscheck` so nobody has to re-derive it.
- **AN EMPTY QUIVER IS COMPLETELY SILENT.** The starting kit is twelve arrows,
  and `Bow.fire` calls `cancel()` and returns when `consumeAmmo` fails: no
  shaft, no event, no complaint on the wire. **Count your arrows before you
  believe a range effect.**
- **A TOLERANCE ON THE MEAN CANNOT SEE A BIAS.** ballisticscheck's first verdict
  passed +0.31 m as "no systematic error" while every one of twelve arrows erred
  the SAME WAY. Test the SIGN SPLIT.
- **DO NOT LET A PRINT STATEMENT ASSERT A CAUSE.** The "did it stay on that
  animal" line editorialised — "an animal it then walked away from" — and
  printed that over its own numbers showing the body stayed for 68 of 133
  seconds. That is FOUR instruments in this project that claimed something they
  had not measured (`hit` as a boolean, `along` as marksmanship, the board
  twice, this). Outcomes name what was SEEN; the reader judges the cause.
- **AND CHECK THE ARGUMENT IS USED.** The same block took the wound's timestamp
  and never referenced it, counting the whole run instead of the part after the
  arrow. It looked right, it read right, and it was measuring something else.
- **PROVE WHICH ARM IS LOADED BEFORE YOU BELIEVE A NUMBER.** `git stash push
  <file>` AFTER committing stashes nothing, and `git checkout -- <file>` on an
  UNTRACKED file restores nothing. Both are silent, both exit 0. **The
  counterfactual that works:** commit first, mutate, run, `git checkout --
  <file>`, then grep to prove the probe is gone AND the real code is back.
- **FORWARD IS `(−sin yaw, −cos yaw)`.** Measured on the server four ways, not
  assumed. Walking a body with `(+sin, +cos)` marches it briskly in the opposite
  direction and yields a beautifully consistent set of numbers about a journey it
  never made.
- **A probe that never revisits ground cannot see a refill bug.** Four bodies
  walking outward in straight lines gave identical numbers with the bug and
  without it. The movement has to come BACK.
- **A `//` COMMENT PUT INSIDE `boardHtml()`'s TEMPLATE LITERAL IS NOT A COMMENT**
  — it is page text, and any backtick in it ENDS THE STRING. **And `npm run
  build` was green**, because vite never compiles `server/` at all. The only
  gate on a server file is running it. **But NOT on a `*check.js` file** — every
  one ends in `main().catch(…)`, so importing it RUNS it. Use `node --check
  <file>`; it is instant and it does not play the game.
- **`| head -N` ON A CHECK LOOKS EXACTLY LIKE THE CHECK DYING EARLY.** `head`
  closes the pipe; exit code 0 and the run was fine.
- **A FED-IN FAKE MADE OF A PLAIN OBJECT AND TWO BORROWED METHODS STOPS TESTING
  ANYTHING THE MOMENT THE REAL METHOD GROWS A THIRD CALL.** Build the body with
  `Object.assign(Object.create(Agent.prototype), {…state})` so the METHODS are
  real and only the state is invented.
- **`server.close()` NEVER CALLS BACK while a keep-alive socket is open**, and
  both a watching browser and `fetch` hold one. It reads exactly like a spin
  loop somewhere else. Track the connections and `destroy()` them.
- **CHECK YOUR INSTRUMENT BEFORE BELIEVING IT.** timbercheck's first pass
  compared collider positions at 1e-6 and reported 2048 of 2149 trees "wrong".
  The colliders come back out of a **Float32Array**. The bug was the check.
- **A tally of intents is not evidence of an outcome.** `arriveWithin` is 6 m and
  `PICKUP.radius` is 2.2: a body pressed E thirty-five times at nothing and every
  check read it as gathering.
- **A FIXTURE WRITTEN FROM THE SAME GUESS AS THE CODE DOES NOT TEST IT, IT
  RATIFIES IT.** Copy fixture values out of a real payload.
- **`me.f` arrives at 20 Hz against a body running at 30** — anything the server
  confirms needs a cooldown on this side.
- **The agent's game clock wraps at 24.** Count real seconds off `dt`. And the
  wound log keeps GAME hours while huntcheck's trace keeps REAL seconds — do not
  compare them without picking one.
- **`highlands.capture()` RUNS A FRAME.** Tune in the source, not the console.
- **`ctrl.yaw = x` is the same trap as `ctrl.position.set` and `warp`.**
- **Sandbox pins `feltC`/`effectiveC`/`wetness`** — `ruleset.current.survival`.
- **`highlands.build()` takes NO argument.** `structures.place('glider', …)`.
- **`HOURS=1` moves the spawn to the other side of the lake** (~420 m).
- **A number that reproduces exactly is a CONFIGURATION, not a drift.**
- **Kill stray processes at the END of your run** — `netstat -ano | grep
  LISTENING` then `taskkill //PID n //F`. 8080 belongs to somebody else's server.
- **A KEY RELEASE YOU DO NOT STEP IS NEVER SENT**; keys go on `window`;
  `javascript_tool` gives up at 30 s and `const` leaks between calls.
- **NEGATIVE `ctrl.pitch` LOOKS DOWN**; `flightHeading(yaw) = yaw + PI`.
- **Two check harnesses run back to back collide.** Re-run the loser alone.
- **Scatter colliders are `highlands.scatter.colliders`**; a creature's Object3D
  is `c.object`; lit fires are `highlands.fires.active`; `hud.heard` holds
  objects — read `h.text`.
