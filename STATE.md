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

Last updated: 2026-08-07, by the session that put SIX REAL MODELS IN THE WORLD
and played them against a human for two hours.

## THE FLEET IS LIVE AND THE DOCS ARE THE ENTRY POINT NOW

Read these three before anything else — they are current, they are short, and
they replace re-deriving today's work:

- **[RUNNING.md](RUNNING.md)** — how to start it. Three files you ever touch
  (`keys.cmd`, `PLAY.cmd`, `STOP.cmd`), the per-seat costs, the knobs, and a
  troubleshooting section built from failures actually hit.
- **[PLAYTEST-2026-08-07.md](PLAYTEST-2026-08-07.md)** — two six-model runs,
  what the models did, and the numbers.
- **[NEXT-BUILD.md](NEXT-BUILD.md)** — the plan, ordered by the blocker.

**IF YOU READ ONE NUMBER: five paid models made ~400 decisions across two runs
and loosed ZERO arrows, while five of seven ended below the eat threshold and
the SCRIPTED control fed itself.** The minds talk, coordinate, lie to each other
and reason about ambushes — and they cannot feed themselves. That is the blocker
and it is phase 1 of the plan.

**Six bugs fixed today, each of which made a model look boring when it was not:**
1. **The OpenAI path ignored its own token budget** (`max_tokens: 120` literal
   against `this.maxTokens` on the Anthropic side). A reasoning model spent it
   all thinking and returned a truncated answer — reported as "no json in reply".
2. **A 4-second deadline** killed every grok-4.5 and Opus-5 call. Reported as
   "This operation was aborted", which reads as a network fault and was ours.
3. **Haiku 4.5 rejects `effort`** outright, 400 every call. Documented in
   `roster.js` since the day it was written; the roster just never set it null.
4. **A mind that spoke before midnight was mute for the rest of the run.**
   `hours - spoke` across a `% 24` clock is negative, and a day here is 26 real
   minutes. It is why a human asked four direct questions and nobody answered.
   `chatcheck` 9/9 is new and covers it.
5. **Speaking wiped a mind's plan** (goal reset to `wander`) and a gated `say`
   vanished without trace. Both in the same ten lines.
6. **Pressing Enter to chat cost you the pointer lock** — `closeSay` never took
   it back. Talking to the players cost you your view of them.

**New checks:** `chatcheck` 9/9 (can a person talk to the minds, and they back),
`keycheck` (proves every key AND every model name, no tokens spent).

**And the persona experiment produced a result.** Tormod is written as a liar.
Over two runs he made contradictory claims naming every compass direction, and
his own private reason field read `"mislead others, claim first"`. Ailsa — the
same seat both times — abandoned a hunt citing "too much conflicting talk". One
adversarial agent on an open channel suppressed five cooperative ones. **It is a
reproduction, not a controlled result**; the control run (truthful Tormod, same
seed) is one word and remains the cheapest valuable experiment on the list.

## Before today: the run that made a body stop being a point. The run before it answered the ceiling question with an
8-run A/B and found the sentinel policing that A/B was blind in exactly the
case that mattered — that section is still below and still true.

## THE BIGGEST GAP IN THE GAME IS CLOSED: `SOLID=on`

**Queue item 2 is built.** Until this run `controller.js` integrated x and z and
NOTHING followed — no sweep, no push-out, no radius test — so a player or an
agent walked through tree trunks, boulders, standing stones, every built
structure and every other person. The only geometric test any body was ever
subject to was the capsule an ARROW is checked against, and its two constants
appeared in no other file in the repo.

```
SOLID=on node server/server.js 8080          # the server
?solid=on  on the join URL                   # the browser, MATCH THE SERVER
```

**Default OFF and off is byte-identical** — `Controller.solids` stays null and
the horizontal step is the same two lines. `solidcheck` **24/24**, two legs and
two counterfactuals (see below).

**THE ONE MEASUREMENT THAT DECIDED THE DESIGN: A CROWN IS NOT SOLID TO A BODY.**
Scanning 2,974 placed trees, the crown sphere reaches into the band a walking
body occupies on **40.2% of them**, and on the smallest it reaches BELOW THE
FEET. Crown radii run 2.4-4.5 m, so a solid crown is a four-metre pillar you
cannot walk round and can be spawned inside — two trees in five would have
become a wall. The trunk is taller than a body on **99.8%**, so the trunk alone
is a complete solid. Crowns are `soft`: they stop arrows and not people.
**Had this been guessed instead of measured, the next run would have been spent
debugging "the collision code makes the forest impassable".**

**AND THE RISK THAT SAID DO NOT BUILD IT IS MEASURED CLEAR.** The reason queue
item 2 was never started was a body wedging against a trunk instead of hunting.
A body crosses **110 m of real timber 12/12**, and the longest it ever went
nowhere while walking is **0.6 s**. The counterfactual — crowns made solid —
takes that to **12.3 s**, so the assertion has teeth.

**People:** the server pushes two bodies apart; the browser does not predict it.
Scenery is generated from a seed and identical on every machine, other people
are not, and predicting a shove against a body you hear about at 20 Hz would
rubber-band both of you. The control arm is the finding: **with SOLID off the
server had two people 0.00 m apart** — standing in exactly the same spot.

### DOES IT BREAK THE AGENTS, AND DOES IT COST ANYTHING? Measured, both no.

**The tick does not move.** `rostercheck 8091 16`, both arms: **60.0 Hz** and
**64.9 vs 65.0 KB/s** per client. The pairwise separation at a full house is 120
pairs a tick and costs nothing you can see. That is the perf risk closed.

**Hunting still works: 5 of 6 huntcheck runs killed** — 3 seeds
(`huntcheck`/`corrie`/`braemar`) × both arms, full output kept, no `head` in the
pipe. **THIS IS A SMOKE TEST, NOT A RATE**, and it is deliberately not written up
as an A/B: one run per seed, on a box with somebody else's server on it.

**Read the ONE failure by its MODE, not by the tally.** `corrie` with SOLID on
wounded a deer with its only arrow and ran out of clock:

| corrie | off (killed, 122 s) | on (no kill, 150 s) |
|---|---|---|
| arrows | 1 → **1 kill** | 1 → **1 wound**, deer to 31 hp |
| refusals | 19.7 /100s | **13.3 /100s** — *lower* |
| m walked per detour | 2 m over 9 | 2 m over 10 |

The body walked its normal distance, refused LESS often, and put its arrow home.
**That is verbatim the red-run mode already recorded below** ("every red run's
arrows went HOME and banked a wound without a kill"), not a body stuck on a tree.
A collision problem would raise the refusals and cut the metres walked; both went
the other way.

**And the variance is larger than anything being measured here:** `braemar`,
which the ceiling A/B below recorded as failing on BOTH arms, **killed on both
arms this time.** Do not quote a hunting rate off three runs.

**NOT DONE, deliberately and stated rather than half-landed:**
- **Animals are not in it.** Deer, goblins and companions still walk through
  people and each other. The creature manager's separation iterates a list that
  has never contained a player. It wants the same treatment and its own check.
- **The server has no structures.** `Structures` is not instantiated in
  `sim/world.js` at all, so a palisade stops arrows in a browser and stops
  nobody on the server. Pre-existing; now it matters more.

### …and a pre-existing artefact this turned up, worth knowing

**Trees are planted at `latticeHeight` (an 8 m-smoothed sample) and a body walks
on `heightAt`.** Over 2,431 real trees the two agree to a median of -0.07 m —
but the tail runs to **4.80 m**, and on **0.7% of trees (18 of 2,431)** the whole
trunk ends up below the walker's feet or above their head. Nothing stops a body
at those and nothing should: the tree is DRAWN there too, so what you walk
through is a trunk buried in the hillside. It predates this work and applies to
arrows exactly as much.

**This cost a wrong diagnosis inside this very run.** solidcheck's first pass
picked 2 such trees out of 24 and reported a push-out bug that did not exist.
The site scan now requires the trunk to reach the walking band, and prints the
rejected fraction so nobody re-derives it.

**IF YOU READ ONE THING ABOUT HUNTING: `shootRange: 26` IS RIGHT. DO NOT RAISE
IT.** Measured, not argued: raising it to 40 m TRIPLES the time a body spends
with a deer inside
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
itself while a detour happened to be open. The control lines read `24 m -> 24 m`
and `27 m -> 27 m` — the range preserved to the metre, as the geometry predicts.

**It did not move the kills** (4/4 → 3/4, noise) and metres walked per detour
stayed at 2, because 8 of 10 episodes still end inside 0.7 s. **The arms did not
face identical worlds**: real-time jitter changes the trajectory, and run 1 of
each arm diverged completely (0 detours vs 10).

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

## WHAT A BODY LOOKS LIKE — five fixes, found by LOOKING. All shipped.

Driven as a real browser client against a real server. All five were live in the
game and none of them broke a single check. Kept to a line each now that
`avatarcheck` (11/11) and `campcheck` (38/38) hold them; the transferable
lessons are in the trap list at the foot of this file.

1. **The crouch squashed the HEAD and the NAMEPLATE**, a text sprite, 28% harder
   to read exactly when somebody is sneaking toward you. Both counter-scaled.
2. **Every PvP kill was "killed by the cold"** — `killer?.species?.name` on an
   object that is a PLAYER and has `.name`. Every interesting death, told wrong.
3. **The palisade was a picture of a wall.** `colliders.add?.()`; there has never
   been an `add`, and the `?.` swallowed it in silence.
4. **…and `campcheck` said it was fine**, asserting a flag set unconditionally on
   the next line. It asserts the tagged cylinder now.
5. **…and making the wall real made it IMMORTAL**, because `Structures.remove`
   knew nothing about the collider. Colliders are RETIRED, not spliced — `grid`
   holds INDICES into `list` — and campcheck proves it with a LIVE SEGMENT QUERY,
   because a retired collider stays in the list by design.

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

## `solidcheck` — 24/24, two legs, two counterfactuals

**The mechanism, offline**: no port, no server, no wall clock, so it can be run
on a busy box and believed. Real `Controller.prototype`, real terrain, 24 trees
and 10 boulders found by SCANNING.

**The wiring, over a socket**: a real server, real sockets, a real trunk and two
real people. A flag read in `server.js` and never handed to a controller would
sail straight through the offline leg — and the counterfactual proves that is
the exact failure it catches.

**EVERY REACH ASSERTION IS A PAIR**: *it never got inside* AND *it got to the
surface*. The first is also true of a body that walked the other way, and this
project has already shipped an instrument that could only see its arm when its
arm failed.

| counterfactual | result |
|---|---|
| crowns made solid to bodies | **19/19 → 16/19**; jam **0.6 s → 12.3 s** |
| `SOLID` read but never handed to the controller | **19/19 → 17/19**; both trunk arms collapse |

(Both were run against the 19-assertion version, before the two-people leg was
added. Method, because two of this project's A/Bs have unknowingly run the same
arm twice: **commit, mutate, run, `git checkout --`, then grep to prove the
probe is gone AND the real code is back.**)

Note what did NOT fall in the first counterfactual: "a body can still cross a
wood" stayed 12/12, because a body that re-aims eventually gets round even a
solid crown. **The JAM line is the one doing the work**, and it only exists
because the wedging risk was named before the code was written.

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
`STOCK=venison:2`, `HUNGER=52`, `DETOUR=commit,close`, `SOLID=on`.

**`SOLID=on` — read this before turning it on.** It is the difference between
six minds standing round a fire and six minds standing INSIDE one another, and
the check's control arm measured that literally: 0.00 m apart. If you turn it on
for the server, **put `&solid=on` on your own join URL too** — that is the
prediction side, and a browser that stops you at a tree the server walked you
through rubber-bands you in a way that looks exactly like lag. Animals are NOT
in it: deer and goblins still walk through everybody.

**`DETOUR=commit,close` is safe for the evening and is now mildly RECOMMENDED**,
which `commit` alone never was. It is the only configuration in which a step
aside has been seen to walk somewhere and produce a shot, and a hunting body
working its way round a knoll toward a deer is worth more on camera than one
sidestepping in place. It did not raise the kill rate; nothing yet has.

## Checks

`firecheck` 57 · `companioncheck` 45 · `glidercheck` 42 · **`campcheck` 38** ·
`boardcheck` 35 · `weathercheck` 27 · `netcheck` 24 · **`solidcheck` 24 (port 8086)** ·
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

2. **ANIMALS STILL WALK THROUGH PEOPLE.** `SOLID=on` closed the body-vs-scenery
   and body-vs-body halves of the old queue item 2; this is the third half, left
   out deliberately rather than half-landed. Deer, goblins and companions pass
   straight through players and through each other, and the creature manager's
   own separation pass (`manager.js:859-894`) iterates `this.creatures`, which
   has never contained a player.

   **It is the loudest one left for the camera** — a deer you are stalking walks
   through you, and a goblin warband occupies one square metre. The shape is
   already built: `ColliderField.resolveBody` is the query, and
   `SimWorld.separatePlayers` is the pattern to copy. It wants its own socket
   check asserting a creature and a player cannot end a tick inside one another,
   and it should ride the SAME `SOLID` flag rather than inventing a second one.

   **The other stated gap: the server has no structures at all.** `Structures`
   is not instantiated in `sim/world.js`, so a palisade stops arrows in a browser
   and stops nobody on the server. Pre-existing, and `SOLID` makes it matter more
   — a wall the host can walk through is worse than a wall nobody can.
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

- **A CHECK'S PRECONDITION CAN BE THE BUG, AND IT LOOKS EXACTLY LIKE A PRODUCT
  DEFECT.** solidcheck's first run reported a push-out failure on 2 of 24 trees
  with a 0.96 m intrusion. The push-out was fine. Its site scan had picked two
  trees whose whole TRUNK sits below the ground a body walks on, because trees
  are planted at `latticeHeight` and bodies walk on `heightAt` and the two
  disagree by up to 4.8 m in the tail. **Before believing a failure, check that
  the thing you set up could ever have passed.** Three of this project's wrong
  diagnoses are now this shape.
- **AIMING ONCE AND WALKING IN A STRAIGHT LINE MEASURES THE CHECK, NOT THE
  GAME.** solidcheck read 8/12 on "can a body cross a wood" and it was the
  check: it set the yaw at the start, so a body nudged three metres sideways by
  a trunk then marched off at a tangent for forty seconds. A real body re-solves
  its heading every tick. Re-aiming, it is 12/12 with a longest jam of 0.6 s.
  **A test body that behaves less adaptively than the real one manufactures
  failures the game does not have.**
- **A SPHERE'S WIDTH DEPENDS ON THE HEIGHT YOU MEET IT AT.** A boulder assertion
  computed the slice at the ground under the ROCK while the body met it standing
  a metre away on a slope — one boulder in ten failed on the difference. Read
  the geometry at the feet the body actually had at the moment of contact.
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
