# The eight, one at a time

A plan per item from the audit. Two are already built; the other six are costed,
ordered, and each has the check that would prove it.

---

## Already fixed — 2026-08-08

**`carrying` filters to `n > 0`.** Built in the feedback slice. `brief()` gained
`lacking`, which states the three shortages that stop you doing something —
*"no arrows — you cannot shoot"* — and `act_shoot` now **refuses to draw** on an
empty quiver instead of miming it. `feedbackcheck` 15/15 asserts both halves.

**`goal` as the only thing carried between decisions.** Built in the plan slice.
`plan` (three lines) and `note` (one page) are carried forward, written by the
mind, never read by the world. The rule that matters is **omitted means keep** —
`undefined` and `[]` mean different things, or a plan would live exactly as long
as a goal did. `plancheck` 14/14.

The remaining six follow.

---

# 1. Minds lose each other for ever at 140 m

**This is now much cheaper than I said, and it should go first.**

### What is actually wrong
`brief()` drops any contact past `AGENTS.noticeRange` (140 m), and every social
verb resolves its target by name **out of the brief**. Past 140 m the other
player is not in the prompt in any form, so `offer`, `accept`, `give`, `attack`,
`follow` and `guard` all silently become `roam()`.

### The thing I got wrong, and it halves the work
I assumed the wire was the problem. It is not. `SimWorld.snapshot` builds its
player list with **no distance culling at all** — every player, every tick, with
exact coordinates. **The agent already knows precisely where everyone is and
throws it away when it writes the prompt.**

So this is a `brief()` change only. No wire change, no protocol change, no
interest-management, nothing to keep in sync.

### The fix
A second, deliberately coarser channel beside `contacts`:

```
also out there: Coinneach, a long way south-west
```

Name and 8-point bearing. **No distance, no condition, no activity** — those are
what `contacts` is for, and putting them here would make 140 m meaningless.
Defensible in plain terms: two crofters in a glen do not lose each other
permanently because one walked over a rise.

Then `goTo`/`approach` resolve against that channel too, so a mind that decides
to go and find somebody actually can.

### Cost, risk, check
About an hour. Low risk — additive, and `contacts` is untouched.
**`farcheck`**: two agents 900 m apart; assert each names the other in its brief,
that `approach` walks them together, and the **sentinel** — that the far entry
carries no distance or condition, so the near channel still means something.

### What it unblocks
Everything social. Every trade, honesty, deception and coordination axis is
measuring zero over zero until this lands.

---

# 2. Dropped loot is not in the snapshot at all

### What is actually wrong
The snapshot carries `pl, cr, co, fi, pr, ev` — no pickups. Deadfall does not
need to be there because it is a pure function of the seed and both ends compute
it. **Dropped venison is not.** So a mind is told *"a deer went down near
320,-140"* by the kill event and then has no way to see or take the carcass.

It is worse than invisible. `case 'gather'` navigates to `nearestDeadfall`,
which is **firewood specifically** — so a mind standing over its own kill that
chooses *"pick up what is lying about"* walks off to a branch. One starved doing
exactly that, with three kills to its name.

And `collectFor` breaks ties **in favour of wood** (`wood.distance <= bestD`),
so even standing on the carcass a branch can win.

### The fix, in four parts
1. **Ship it.** `this.pickups.dropped` is already a clean array of exactly the
   right things — items that entered the world through a kill or a drop, kept
   separate from hash-placed deadfall. Add `lo: [{i, n, p:[x,y,z]}]` to the
   snapshot, bounded by an interest radius. The list is a handful of entries.
2. **See it.** Loot becomes a `contacts` entry — *"3 venison, right here to the
   north"*. It is a thing you can see and walk to, which is what contacts are.
3. **Take it.** `gather` gains an optional `item`. `{"kind":"gather","item":
   "venison"}` goes to the nearest matching drop; bare `gather` goes to whichever
   of (nearest drop, nearest deadfall) is actually closer — which is what "pick
   up what is lying about" means in English. **`makeCamp` stays wood-only**: it
   means "a place with fuel in reach" and must not start walking to carcasses.
4. **Flip the tie-break.** `<=` becomes `<` in `collectFor`, so the nearer thing
   wins and wood stops beating meat at equal distance.

### Cost, risk, check
Half a day. Medium risk — it touches the wire, so the interest radius has to be
bounded and `INTENT_KEYS`-style allow-lists checked. (`give` shipped broken once
for exactly that reason.)
**`lootcheck`**, over a real socket: kill a deer, assert the carcass appears in
the brief, that `gather venison` puts it in the pack, that `makeCamp` still
finds wood and not meat, and the **conservation** assertion — nothing minted.

### What it unblocks
The other half of "can a mind feed itself". The quarry fix let them hunt; this
lets them eat what they killed.

---

# 3. `sanitiseGoal` degrades silently

### What is actually wrong
Two failure paths, both silent:

- A goal missing its parameter becomes `{kind:'wander'}` in `sanitiseGoal`.
- A target name not in the brief becomes `roam()` in the agent's `resolve()`.

In both cases the mind chose something, the world did something else, and
**nothing told it.** This is the same disease as the feedback slice, in the one
place it was not fixed — and it is the direct cause of the next item.

### The fix
Small, and it reuses the channel already built:

- `sanitiseGoal` attaches `refused: 'hunt needs a quarry'` rather than quietly
  substituting. The caller turns any `goal.refused` into an outcome line.
- `resolve()`'s name misses call `noteOutcome('there is nobody called "Eachann"
  you can see')`.
- A `refusedVerbs` counter on the board, so **a verb that is being reached for
  and failing looks different from a verb nobody wants.** Right now those two
  are indistinguishable, which is why item 4 has no evidence either way.

### Cost, risk, check
Two hours. Low risk.
**Extend `feedbackcheck`**: assert each degradation produces an outcome line,
and the sentinel that a well-formed goal produces none.

### What it unblocks
Item 4's measurement. And it is the cheapest thing on this list that a model can
actually act on: a mind told *"nobody called Eachann is in sight"* can fix
itself; a mind that silently roams cannot.

---

# 4. `sight` is only populated inside bow range

### What is actually wrong
`sight: clear === null || d > this.shootRange ? null : …` — so between about 30
and 90 m a mind is handed a target and **nothing at all** about whether it can be
hit. It closes, draws, and the solver refuses. That is half the accuracy problem
and a large share of the 400-draw loop.

### The argument for the current behaviour, and why it only half holds
The comment defends it: at 120 m *"you have a clear line"* is not information,
it is noise in the prompt. **That is right about the positive and wrong about the
negative.** "There is a hill between you and that deer" is useful at any distance
you might walk toward it; "you have a clear line" at 120 m is not.

### The fix
Asymmetric, which is the whole trick:

- **inside bow range** — unchanged. Both *"a clear line"* and *"no clear line —
  ground in the way"*.
- **beyond it, out to `noticeRange`** — say something **only when blocked**:
  *"the ground rises between you"*. Never state a clear line at range.

So the prompt gains a warning and no noise.

### Cost, risk, check
An hour. Low risk. The sightline computation already runs; only the gate moves.
**Extend `huntcheck`** with the refusal ratio it already measures, as an A/B —
this is one of the few items where the existing instrument can show the
difference directly.

---

# 5. The reflex layer has no guards

Three separate things wearing one label. Worth splitting, because one is already
half-done and one is really Ben's fire-cost item.

### 5a. 100+ fires
There **is** a guard — `AGENTS.fireNearby` (9 m) plus a `placeCooling` timer —
and 106 fires happened anyway. 9 m is simply too tight: a body that walks twenty
metres and lays another is not near its old fire by that rule, and it wanders
constantly.

Fix: **the agent remembers where it laid fires** and refuses within a much larger
radius, rather than relying on `nearestFire` seeing one in the snapshot. Pair it
with Ben's **10 branches per fire** — a fire that costs ten is self-limiting in a
way a rule never quite is, and the two together are belt and braces.

Half a day including the cost change. **`firecheck` extension** asserting a
bounded count over a fixed window.

### 5b. 400+ releases with no arrow
The empty-quiver half is **already fixed**. What remains is draws the solver
refuses for terrain. Fix: count consecutive refusals at one target; past a
threshold, break off and say so through the outcome channel. Largely subsumed by
item 4 — a mind told the ground is in the way at 60 m does not walk into it.

### 5c. `gather` navigates to firewood
Covered by item 2, part 3.

---

# 6. Six of fifteen verbs, never reached

### What is honest to say about this one
**This is not a fix, it is a measurement**, and it cannot be done until the
others land. The prompt half is already built — the model is now told that
`offer` and `give` include the walk, and that speech is free.

What remains genuinely unknown: whether the verbs go unused because they are
*hard to reach* or because the models *do not want them*. Right now those are
indistinguishable, and every item above is a reason the evidence is unusable:

- they could not see each other (item 1)
- a refused verb looked identical to an unwanted one (item 3)
- speech cost an action until this afternoon

### The plan
1. Land items 1, 2 and 3.
2. Run the same two-seat roster on a fixed seed with the **refused-verb counter**
   visible.
3. *Then* read the result. If `offer` is being reached for and refused, it is a
   mechanics problem. If it is never reached for at all, with the walk stated and
   the target in the prompt, that is a real finding about the models.

Also worth doing while there: make `offer`'s `want` optional. Three required
arguments against `approach`'s one is a real gradient, and a model takes the easy
verb.

---

# The order I would do them in

| | item | cost | why here |
|---|---|---|---|
| 1 | **Minds find each other (140 m)** | ~1 h | Everything social is blocked on it, and it turned out to be a prompt-building change rather than a wire change |
| 2 | **Silent degradation** | ~2 h | Cheapest thing a model can act on, and it is the instrument for item 6 |
| 3 | **`sight` beyond bow range** | ~1 h | Small, asymmetric, half the accuracy problem |
| 4 | **Loot on the wire** | ~½ day | The other half of feeding yourself; the only one that touches the protocol |
| 5 | **Fire cost + guards** | ~½ day | Ben's item, and it makes firewood the first real currency |
| 6 | **Measure the verbs** | a run | Only meaningful once 1–4 have landed |

Items 1–3 are about four hours together and all three are low-risk. They would
also make the *next* run interpretable, which the last one was not.

**Starting with item 1** unless told otherwise.

---

# What actually happened — all six, 2026-08-08

| item | done | check |
|---|---|---|
| 1. Minds find each other at 140 m | ✅ | `farcheck` 17 |
| 2. Silent degradation | ✅ | `feedbackcheck` 15 → 20 |
| 3. `sight` beyond bow range | ✅ | `farcheck` |
| 4. Loot on the wire | ✅ | `lootcheck` 13 |
| 5. Fire cost + guards | ✅ | `firecheck` 57 → 64 |
| 6. The verb measurement | prepared, not yet read | needs a paid run |

## Three bugs found while fixing others

**`goTo` had never once worked.** It is in `GOAL_IDS`, the system prompt
advertises it — *"goTo takes place"* — and the agent's resolve switch had **no
case for it**. It fell through to `default: return this.roam()`. Every mind that
ever decided to make for a named place wandered at random.

*That corrects something I reported during the run.* I read "make for Hollowed
Beinn" followed by both minds converging on that hill as the first time either
had navigated to a named place. It was two bodies roaming near the same hill.

**`follow` and `guard` used `label === g.target`** — a strict equality. Same
class as the original quarry mismatch, where `label === g.quarry` against labels
carrying their article meant five models fired zero arrows across 400 decisions.

**`resolveOffer` silently did nothing on a missing `want`.** Three required
arguments against `approach`'s one is a real gradient, and a model takes the easy
verb. A price you do not name now means coin.

## The fire cost, measured rather than assumed

Six scripted bodies, `SCARCE=on` (the *hard* setting), one full day:

```
hour 10-16   zero fires, wood banking up      2 -> 26 branches
hour 17-21   fires begin as the cold bites    wood 26 -> 0-6
hour 22-23   hp dips to 25 / 26 / 32          three of six in trouble
hour  2.8    ONE DEATH                        recovered by morning
hour  6.1    all six at 100, wood rebuilding  3-13 branches
```

**Fires per player-hour fell roughly fortyfold** — against 106 fires from two
minds in seven hours before.

**And one scripted body died.** That is worth stating plainly rather than
filing under "stakes are the point". Three things about it:

- `SCARCE=on` is the harsh setting; the duo roster runs `0.7,0.5`, and the
  default runs neither.
- Three bodies were at **food 0** in the same window, so starvation was in play
  as much as cold.
- The scripted brain does not bank wood before dusk. A mind that plans might.

**If the floor keeps dying, the number is wrong, not the world.** That is a
measurement to take on the next run, not a reason to re-tune blind — this
project has three separate records of a constant being moved on an argument and
the failure simply relocating.
