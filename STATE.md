# State of play — read this first, it is short on purpose

**Last updated: 2026-08-11 (late)**, by a session that fixed four breaks in the
food chain, watched the chain complete live for the first time, and then fixed
the three instrument bugs that run exposed.

## START HERE — 2026-08-13: minds can now MAKE things, and runs are recorded

**Four TIER 0 items landed overnight. Read TODO.md's TIER 0 for the full list.**

1. **`craft` — a verb for making things (0a).** Fifteen goals and not one of them
   made anything: a mind holding wood and no arrows could not say *"make
   arrows"*. It is the `eat` bug one economy over. Takes an optional noun named
   by what comes OUT ("arrows", "cooked venison"), resolved through
   `resolveItemId`; walks to a fire when the recipe needs one; refuses in words
   otherwise. **Used by live models within 39 minutes** — far faster adoption
   than `eat`, which took three runs to be used once.
2. **You cannot eat a fire (0c).** Below hunger 30 the 14-wood fire reserve drops
   to nothing, so a body no longer starves holding the wood that would arm it.
3. **The run is written down (0f).** `server/journal.js`, append-only JSONL under
   `runs/`. The 400-deep rings were the ONLY record and they ate five transfers
   in one evening; three runs survive only because board.json was snapshotted
   from outside by hand. Every deed and decision now has a `seq`, and gaps are
   ADMITTED rather than swallowed.
4. **Makes and meals record WHO ASKED.** `by: 'choice'` vs `by: 'reflex'` on the
   deed. Without it the scripted control fletching by reflex read as the new verb
   working — which it briefly did, to me.

**AND ONE I GOT WRONG, WHICH MATTERS MORE THAN THE THREE I GOT RIGHT.** TIER 0b
said fletching was gated behind a fire it did not need. **Every recipe carries
`requires: 'fire'`.** My diagnostic printed `r.station`, a field that does not
exist on a recipe, read "none" for all six, and I shipped a branch AND a prompt
line telling the models "arrows need no fire". `craftcheck`'s first assertion now
pins the truth. The real arrow problem survives and is a DESIGN question, stated
in TODO 0b: arming yourself costs ten branches for a fire plus two to fletch.

**WHAT IS STILL UNPROVEN LIVE:** that a bare `craft` picks ARROWS when arrows are
genuinely needed. `craftcheck` proves it in the harness; in the wild the reflex
keeps fletching first, which is 0c working. Watch for `by: 'choice'` with
`id: 'arrow'` in a journal.

## The state before that — the chain works live. The eat verb barely does.

**[runs/FOODTEST-2026-08-11.md](runs/FOODTEST-2026-08-11.md) — the full chain
executed in a live run for the first time in this project:** kill → gather
firewood → light a fire → cook → eat. Two Grok, two Kimi, one scripted control,
Ben in the world. Against the hour run's *635 decisions, 0 items, 0 meals*, three
of four model seats fed themselves, on two vendors, with 0 failed calls.

**AND THE CONTROL CAME LAST BUT ONE.** Iseabail foraged more than any model — 22
branches — and went to food 9 because she never killed anything. Coinneach hit
food 1 the same way. **With gather fixed, the binding constraint moved upstream
to HUNTING.** That is the next arc-1 question.

**WHAT IT DOES NOT PROVE, and do not cite it as if it does: every meal was the
REFLEX.** `upkeep()` has always eaten below `eatBelow` (45). **No mind chose the
`eat` verb once, in 268 decisions.** Fixing `gather` unblocked the chain and the
reflex did the rest — which is exactly what the correction below predicted. The
verb's value is still unproven and is about CHOICE: eating early, before a hunt
or ahead of the cold, above where the reflex would act.

**THE NEXT RUN** wants `SCARCE=on` and a longer window — enough pressure to give
a mind a reason to eat before the reflex would, and long enough to answer arc 1's
real bar: *a seat surviving a night unaided, and two seats reaching an outcome
neither could reach alone.* Launch it with **`PLAY-FOODTEST.cmd`**
(roster: `roster-foodtest.json`), and **`STOP.cmd`** when done — that is what
stops the money.

### Fixed after that run — three instrument bugs, one disease

All three were *counting the press instead of the outcome*, the cure for which
this repo already had written down for crafting. Covered by `foodcheck` (29/29).

1. **A chosen `eat` wrote no deed** — invisible on the board and uncountable in
   the report. Introduced the same afternoon by the commit that fixed arc 1.
2. **The reflex wrote its deed at the PRESS** — and `World.update` drops an eat
   in silence on an empty pack or a full belly, so a body pressing at nothing
   read as a body eating. `noteMake` fixed this identical bug for crafting three
   months earlier, one method away.
3. **Refusals counted per retarget, not per decision** — Eachann finished on
   `gather: 73` against 50 decisions *while holding 16 branches he had picked
   up*. A number bigger than the decisions it describes reads as a broken verb.

The eat deed now follows **the belly rising on the server's own snapshot**
(`noteMeal`) — `body.eat()` is the only line in the codebase that raises hunger,
so a rise cannot be faked by wanting it — and it records **who asked**, so reflex
and choice can finally be told apart. `playreport` now splits *"never reached
for"* from *"reached for and refused"*, which closes arc-2 debt item 1.

## The four food-chain fixes underneath all of that

**The two fixes the last session named are done, and two more that were hiding
behind them.** All four are proven by a new socket-level check —
`npm run foodcheck`, **29/29** — that stages real bodies on a real server and
asserts outcomes: did the pack gain wood, did the meat leave the pack, did the
belly fill.

1. ✅ **`branch` reaches the firewood.** `resolveItemId` had always mapped
   branch/branches/a branch → `wood`; `gather` was the one caller that never
   asked it, and `namesTheSame('branches','branch')` is false because "branches"
   is not a word inside "branch". Fixed in the gate AND in `nearestDrop`, which
   had the identical bug and would have walked a mind past a dropped branch at
   its feet. All six spellings now land.
2. ✅ **Minds have a word for eating.** `eat` is in the goal table, in the
   prompt, and wired to the `intent.eat` the server has honoured all along.
3. ✅ **NEW — a bare `{"kind":"gather"}` was silently becoming `wander`.**
   Declaring `item` made the noun *compulsory*: `sanitiseGoal` turns a goal whose
   every declared param is missing into a walk. So the plainest way to say "pick
   something up" — and what every mind sent for the whole life of the project
   before the noun existed — was refused. Specs can now say `optional: true`.
4. ✅ **NEW — the server ate twice per decision.** The sim runs at 60 Hz and an
   agent sends at 30, and `p.intent` persists between packets, so one `eat` pulse
   was honoured on two consecutive ticks: venison 2 → 0 in one breath. Now
   edge-detected like `give`, `offer`, `accept` and `drop` already were. **This
   was never agent-only — a human's eat key could always swallow twice.**

**A CORRECTION TO THE LAST HANDOVER, and it matters for reading the hour run.**
"No mind in this world can eat" was true of the *vocabulary* and not of the
*body*: `upkeep()` has always eaten by REFLEX — a cooked meal below `eatBelow`
(45), raw below `eatRawBelow` (18). So the missing verb is **not** what produced
0 meals. **The gather break is upstream of everything**: 0 items picked up means
there was never any food for the reflex to eat. What the verb actually adds is
*choice* — the reflex is deliberately conservative and will not spend raw meat
above 18, so until now a mind could not decide to eat early, before a hunt or
before the cold came on. `foodcheck` stages every body at hunger 60, above both
thresholds, with a control arm that is never given the goal, precisely so the
reflex cannot be mistaken for the verb.

**~~NEXT~~ — DONE, the same night.** All four were taken into a live run and the
chain completed; see START HERE. The token-ceiling fix also held: both Kimi seats
answered with **0 failed calls**, against Coinneach's 116 failures in the hour run
when 3000 tokens truncated it mid-thought. That hour run was never a three-model
test and nothing about Grok-vs-Kimi may still be read from it — but tonight's
was, and can.

**AND ONE WRITER AT A TIME.** Pause `highlands-triage` before working here, and
before Ben plays. The bill for ignoring it is immediately below. *(All three
scheduled tasks were already disabled when this session started, and it left them
that way.)*

## READ THIS BEFORE ANYTHING ELSE, 2026-08-11

**TWO SESSIONS RAN IN THIS TREE AT ONCE AND IT COST MORE THAN ANY BUG THIS WEEK.**
STATE.md has said "one writer at a time" since the 10th. Here is the bill:

- The other run committed my uncommitted working files as its own (`client.js`,
  `inventorycheck.js`, `package.json` in 07f02da).
- It ran `inventorycheck` while a **deliberate counterfactual probe** of mine was
  sitting in `world.js`, read 7/12, believed it, and wrote a long confident commit
  message concluding *"the write path between `intent.drop` and a visible item is
  still broken"*. It is not broken. On a clean tree that file is 29/29.
- It added a second `lo` reader to `main.js` (de788a8) not knowing `remoteloot.js`
  had been drawing ground loot since the 9th — every dropped branch would have had
  two meshes. Removed in b311101.

**If you are a cron and a human is playing, or another cron is up: stop.** Check
`git log --format="%ci %s" -5` for a commit newer than your session start before
you trust ANYTHING in the tree, including your own measurements.

**HOW TO READ IT.** Everything down to "Things that will waste your time" is the
current state and the next thing to do. Below that is a standing TRAP LIST rather
than news, and it is the most expensive knowledge in the repo: every entry cost
somebody a wrong diagnosis. **Skim it before you debug anything, not after.**

> **WHY THIS FILE WAS REWRITTEN.** It had reached 892 lines — the file whose own
> header says "short on purpose" and asks for ~100. A cold reader (me) opened it,
> saw `Last updated: 2026-08-07` at the top, cross-checked a git log whose most
> recent 120 commits were all cron noise, and concluded the project had been dead
> for three days. It had not: 35 commits landed on the 9th. **A stale handover is
> worse than none, because it is believed.** Everything cut is in
> `STATE-ARCHIVE-2026-08-10.md`. Cut the closed sections; do not let this grow back.

## THE HOUR RUN, 2026-08-11 — THE ANSWER IS NO, AND WE KNOW WHY

Three models, personas OFF, 110 minutes: **[runs/HOUR-2026-08-11.md](runs/HOUR-2026-08-11.md)**
is the full transcript and analysis. Headline:

**635 decisions · 636/3000 calls · 952,805 tokens · 118 failed calls · 65
sentences gagged, 0 logged as spoken · 0 kills · 0 items picked up · 0 meals.**

| seat | model | printed decisions | from the MODEL | failed calls |
|---|---|---|---|---|
| Eachann | grok-4.20-0309-non-reasoning | 101 | 98 | 0 |
| Tormod | grok-4.5 | 115 | 113 | 2 |
| Coinneach | kimi-k2.6 | 101 | **34** | **116** |

**~~NEWLY RED~~ — FIXED 2026-08-11, later the same day. Both of these, plus two
more of the same family found underneath them, are green and covered by
`npm run foodcheck` (20/20). See START HERE at the top — including the
correction that the missing verb was NOT what caused the 0 meals. Kept below
because the diagnosis is still the clearest statement of what was wrong:**

1. **`gather` cannot hear the word "branch".** 82 of 98 gather decisions named
   `branch`; every one was refused. `agent.js:2845` gates deadfall behind
   `namesTheSame('wood'|'branches', want)`, and "branches" is not a word inside
   "branch", so `wood` goes null — and deadfall is not in `snapshot.lo`, so the
   drop lookup misses too. **This is a REGRESSION from yesterday's noun fix**:
   before it, `want` was always `''`, and `''` opens the gate. `resolveItemId`
   gets it right and `nouncheck` is green over it; `gather` does not call it.
   *A check green over a path no caller could reach* — again.
2. **No mind in this world can eat.** `world.js:1599` honours `intent.eat`; the
   only setter in the codebase is a keypress (`input.js:341`). `goals.js` gives
   a mind fifteen verbs and `eat` is not among them. Fixing (1) alone produces
   minds that gather firewood and starve holding meat.

**Also red, and cheaper:** `refuse()` never reaches the operator log (~98
refusals, 0 printed — the most important fact about the run is absent from the
run's own log); the kimi alarm fires once and never repeats; the fleet's elapsed
clock ran 26% slow (110m reported against 150m wall) and nothing stopped at the
hour that was asked for.

**METHOD WARNING, and it is the "one writer at a time" rule again:** three
commits landed *while the fleet was running* (b311101 16:01, 46fbf67 16:10,
4f0b534 16:12; fleet started 15:55:47). Node does not hot-reload, so the run
executed pre-fix `agent.js` — **953k tokens measured a tree that no longer
exists**, and every speech claim from it is about superseded code. Check
harnesses also joined the live world ten times mid-run, Alice **with a wolf cub**
three times, in a pets-off control arm.

**GREEN, and the brief that said otherwise was stale:** `inventorycheck` is
**29/29** on the current tree, not 7/12. The drop path is not broken. Also
green this session: `build`, `nouncheck` 18/18, `timbercheck` 17/17.

## WHERE IT IS ALL GOING

**[TRAJECTORY.md](TRAJECTORY.md)** is the programme-level plan — the six arcs,
their order, and the decisions that are not up for re-litigation. VISION.md says
what the world IS; TRAJECTORY says what the WORK is. Read it at any point where
you are choosing what to build rather than how.

## WHERE THE GAME IS

The fleet runs. Six models have played against a human for two hours
(`PLAYTEST-2026-08-07.md`). Start it with the three files in **[RUNNING.md](RUNNING.md)**
— `keys.cmd`, `PLAY.cmd`, `STOP.cmd`. **[TODO.md](TODO.md)** is the tiered backlog;
**[NEXT-BUILD.md](NEXT-BUILD.md)** is the record of predicted-versus-found and is
worth reading for that alone.

Tiers 1, 2a and 2.5 are done. Open: 2b/2c, 2.75 (gold is a FORK, not a bug),
3 (the troll is unmeetable), 4 (the world runs down), 5 (instruments).

## THE ONE NUMBER, AND IT HAS NOT MOVED

Across two six-model runs, ~400 decisions: **five paid models loosed ZERO arrows
and five of seven ended below the eat threshold, while the seat with no mind at
all was fed and comfortable.** Written 2026-08-07. Nothing since has shown it
fixed. The minds talk, coordinate, lie and reason about ambushes — and they
cannot feed themselves. Everything else on the list is a feature; this is the
game not working.

**2026-08-11 — it still has not moved, but it is no longer a mystery.** A third
run, 635 decisions: zero kills, zero pickups, zero meals. The two reasons are
named above and both are in OUR code, not the models': a noun the gather path
cannot hear, and a verb for eating that does not exist. The minds asked for the
right things in the right order for 110 minutes. **Stop reading this number as
"the models cannot survive". They were never given hands or a mouth.**

## GROUND LOOT AND THE PACK, 2026-08-11 — CLOSED

The job was "ground loot is invisible, and inventory must be trustworthy". **The
handed-down diagnosis was wrong in its main claim and right about the symptom.**

- **`lo` WAS ALREADY BEING DRAWN.** `src/net/remoteloot.js`, since d0dafda on the
  9th, constructed at the top of `boot` and ticked at `main.js:3425`. The briefing's
  `grep "restoreDrop\|snap.lo" src/main.js` found nothing because RemoteLoot spells
  it `snapshot?.lo` **in another file**, and `pickups.dropped` is the LOCAL list,
  which is correctly empty while connected. **Grep for the field, not a spelling.**
- **THE REAL BUG WAS THE CLIENT'S SEND GATE, AND IT IS FIXED.** `sendIntent` is
  limited to `NET.intentHz` (30) while the frame loop is rAF (60-144), and
  `PlayerInput.poll` clears every one-shot field each frame whether or not anybody
  sent it. So a PULSE — `selectSlot`, `drop`, `interact`, `eat`, `craft`, `give`,
  `place` — that landed on a skipped frame was a keypress that never happened.
  **Measured against the real gate: 33% of presses arrived at 60 fps, 21% at 120.**
  That is Ben's *"when i drop a branch it looks like an arrow"*: you press 3, the
  browser selects the branch locally so your hand and hotbar both show one, the
  server never hears, and Q drops what IT thinks you hold — the arrow. `NetClient`
  now latches pulses until a packet actually goes out.
  - The project already knew half of this: `protocol.js` says the server "receives
    at most half" the look deltas, and `lightFire` has its own packet with a
    comment describing the identical trap. Two fields were rescued one at a time
    and the other twelve were left in the hole.
- **Two new checks.** `inventorycheck` 29/29 — wood, arrow, venison, hide and stone
  each go pack → ground → pack over a real socket, asserting the RIGHT id lands,
  the right count leaves `me.iv`, a SECOND client sees the same entry 0.000 m away,
  the pack is restored, the bow refusal speaks, and nothing is minted. `pulsecheck`
  14/14 — drives the REAL `NetClient` at 60/75/120/144 fps, because every other
  socket check builds a raw socket and HOLDS an intent for six frames, so **not one
  of them has ever touched the client's send gate**. Both were watched going red
  under a counterfactual before their green was believed.
- **The honesty pass is done**: `nodrop` refusals speak to player and mind, the
  hotbar shows `38/40` at three-quarters of the carry cap and toasts
  `perception.js`'s own sentence at the cap, and speech that SUCCEEDS is logged
  with a `N said / M gagged` count on the tick line (`gagged` had been counted
  since the gate was written and read by nothing).

## THE SUITE: 61 checks, 60 green

Full sweep 2026-08-10. `huntcheck` **6/7** is the only real partial — an agent
still does not reliably kill a deer.

**Correction, 2026-08-11: `netcheck` is 23/24, not 24/24, and has been for a
while.** `snapshot budget is small` fails at ~167 KB/s against a 120 limit.
Checked against a worktree at 85ea414, before any of the 11th's work: it fails
there too, at 182.6. Nobody's regression; an open item nobody had noticed.

Four checks reported nothing in the batch and **all four are fine**:

- `netcheck` and `agentcheck` 17/17 **pass when run alone** (netcheck at its 23/24,
  above). They collided in the batch. This is the last entry in the trap list,
  hit again.
- `refillcheck` passes; it prints no `N/M` summary line, so a grep for one misses it.
- `keycheck` is **not a test, it is a pre-flight.** It currently says *"6 seats
  will not think tonight"* — the keys are not in `keys.cmd`. The game still runs;
  those seats fall back to scripted. **Run it before any paid evening.**

And note **a failing check exits 0**, so a red suite looks green to anything that
reads exit codes. Parse the output, not the status.

## THE OPEN BUG, DIAGNOSED AND NOT FIXED

Last real commit, 2026-08-09 22:37: **`gather` cannot take the noun its prompt
promises.**

- `goals.js` declares `gather` with `params: []`, so `sanitiseGoal` strips `item`
  from every model reply, silently.
- `providers.js:278` tells all six models that `gather venison` walks them to a carcass.
- `agent.js` reads `g.item` — a field no mind can set.
- **`lootcheck` is green over a path no real caller can reach**: it builds the goal
  by hand and never imports `sanitiseGoal`.

Measured over eight logs: `gather` is the most-issued goal in the project (281x).
Of 972 gather deeds ever, **866 wood and 15 venison**. The minds reach for meat
constantly and the verb cannot accept the noun. Eighth instance of the model
looking worse than the instrument. Fix items are A254-A257 in `IDEAS.md`.

## THE CRONS — READ THIS BEFORE TRUSTING ANY BACKLOG

- **`highlands-triage` (the BUILDER) was disabled and did not fire for ~92 hours.**
- **`highlands-evaluate` (the OBSERVER) fired ~165 times in that window** and
  produced 36 commits and ~3,465 lines with **zero lines of code**. The live board
  died around 06:00 on the 10th and it went on writing passes about a dead board
  for sixteen hours, asking thirteen times for a toggle it cannot throw itself.
- **Disabled `highlands-evaluate` on 2026-08-10.** An observer with nothing to
  observe is pure cost, and a write-only backlog is not progress.
- **One writer at a time.** Two crons — or a cron and a person — editing this tree
  at once corrupts both. Pause the builder before a human plays: it edits source,
  and a dev-server reload dumps a player to the title screen.

## CONFIRMED WORKING, 2026-08-10

- **A bow you can see on other players.** Slung across the back, drawn into the
  hands. `bowcheck` 11/11, and verified by eye through watch mode —
  `shots/bow-eachann.jpg`. (`runs/bow-on-the-back.png` does NOT show the feature;
  the real evidence is `shots/bow-1-rest.jpg` and `shots/bow-2-drawn.jpg`.)
- **The watch board.** `?watch=1` — the camera flies, the body does not move,
  because a watcher sends no intents and takes no corrections. Free-fly (Y) moves
  your BODY and is useless in multiplayer; past `NET.driftSnap` you are yanked
  back. Use watch mode to look at anything, including your own players.

## NEXT, RANKED

1. **PROVE ARC 1 IN A LIVE RUN.** `gather`'s noun was fixed on the 9th and the
   pulse gate on the 11th, and **both fixes are unproven against a real fleet**.
   Between them they are most of "the models cannot feed themselves": the verb
   could not take its noun, and then two acts in three were being thrown away by
   the send gate. Run six seats and read the one number. Nothing below matters
   until this is measured.
2. **Make `lootcheck` pipe through `sanitiseGoal`** — and audit the other checks
   for the same shape. A green check over an unreachable path is a lie.
3. **`huntcheck` 6/7** — instrument predicted-versus-actual impact rather than
   tuning constants. Three tuning passes moved the failure around without fixing it.
4. **`netcheck`'s bandwidth**, 167 KB/s against a 120 budget. Pre-existing, and
   nobody has looked at what grew.

## The trap this project falls into

**A name used and never defined** — invisible to build, only found by running the
line. Grep every identifier your new code uses. **And a clean build proves
nothing**: one run's build was green while `gather` had never once put a branch
in a pack. Verify by driving the game, and make the check assert an OUTCOME.

## Things that will waste your time if you do not know them

- **GIVING A VERB A PARAMETER CREATES NEW WAYS TO ANSWER IT BADLY, AND THEY WILL
  BE FOUND ONE AT A TIME, LATE.** `gather` learned the noun `item` on 2026-08-10.
  That one word produced FOUR separate failures, each found in a different
  session: the word `none` searched for an item called none; the singular
  `branch` missed a word-boundary match and refused 82 of 98 decisions; the field
  left out entirely turned a bare gather into a `wander`; and `nearestDrop` had
  the same boundary bug as the gate, so the fix worked for standing deadfall and
  not for a dropped branch. **When you add a parameter, enumerate every way a
  model can answer it — the right word, a synonym, a plural, "none", and NOTHING
  — and put a check over all five in the same commit.** `foodcheck` does.
- **AN AGENT DOES NOT TICK ITSELF, AND A CHECK THAT FORGETS IT READS A FLAT
  ZERO.** `connect()` opens the socket and starts nothing; `update(dt)` is driven
  from outside by the `setInterval` in `agents.js`. Every other agent check gets
  away with not knowing this because none of them need a body to ACT — they read
  memory, or events, or call `resolve()` directly. The first cut of `foodcheck`
  reported no meals, no refusals, nothing, and it looked exactly like "the new
  verb does not work". What gave it away was counting calls to `upkeep` and
  `resolve` and finding both at zero — **instrument the instrument.**
- **THE INTENT PERSISTS BETWEEN PACKETS AND THE SIM RUNS FASTER THAN THE SENDER,
  SO ANY ONE-SHOT INTENT FIRES TWICE UNLESS IT IS EDGE-DETECTED.** 60 Hz sim, 30
  Hz agent, browser at its frame rate. `drop`, `give`, `offer` and `accept` each
  learned this separately; `eat` was the fifth and cost a whole extra meal per
  decision. `place` has an agent-side cooldown instead. **If you add a field to
  `INTENT_KEYS` that DOES something once, edge-detect it in `world.js` the same
  day** — and note that this is a human bug too, not an agent one.
- **A ONE-FRAME FIELD AND A RATE LIMIT ARE A SILENT DATA LOSS, AND THIS PROJECT
  DISCOVERED IT THREE TIMES WITHOUT GENERALISING IT ONCE.** `sendIntent` gates on
  `NET.intentHz`; `PlayerInput.poll` clears every `pressed*`/`pending*` field
  every frame regardless. So two presses in three vanished — and the browser's
  own HUD showed them succeeding, because the LOCAL half of every act ran. It
  was patched for `aimYaw` (protocol.js says so), patched again for `lightFire`
  (whose comment describes the exact mechanism), and left in place for the other
  twelve fields. **When you fix a bug in one field, ask what else has that
  shape.** `pulsecheck` guards it now, including an allow-list audit that goes
  red on a new wire field nobody has classified.
- **EVERY SOCKET CHECK IN THIS REPO IS BLIND TO CLIENT-SIDE LOSS, BY
  CONSTRUCTION.** They build a raw `Body`, set `intent.drop = true`, and send it
  themselves for six frames at 30 Hz. That exercises the server beautifully and
  never touches `NetClient`, which is where the send gate lives. dropcheck was
  8/8 throughout a bug that ate two acts in three. **If the bug could be in the
  browser's half, the check has to drive the browser's half** — node has a
  global `WebSocket`, so the real client runs headless unmodified.
- **A `grep` THAT MISSES IS INDISTINGUISHABLE FROM A FEATURE THAT IS ABSENT.**
  `grep "restoreDrop\|snap.lo" src/main.js` returned nothing and was read as
  proof that nobody drew ground loot. `remoteloot.js` had been drawing it for two
  days, spelled `snapshot?.lo`, in another file. A whole session's diagnosis, and
  then a duplicate implementation, came out of one over-specific pattern. **Grep
  for the FIELD (`\.lo\b`), across `src/`, and only then conclude "nobody reads
  it".**
- **COMMIT BEFORE YOU MUTATE — AND ASSUME SOMEBODY ELSE MAY RUN WHILE YOU DO.**
  The counterfactual discipline in this file says to mutate the real code to
  prove a check can fail. That is right, and on the 11th another session ran
  `inventorycheck` during a four-second window when the probe was in, and
  published its reading as a finding. **Probe, run, revert, in one unbroken
  stretch** — and if the tree has more than one writer, do not probe at all.

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
