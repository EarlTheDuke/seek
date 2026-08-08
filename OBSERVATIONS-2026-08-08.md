# The two-mind long run — live observations

One grok (`grok-4.20-0309-non-reasoning`, 20 s cadence) and one kimi
(`kimi-k2.6`, 75 s) alone in the glen. `HUNGER=52`, `SCARCE=0.7,0.5`, no
scripted control. Started 2026-08-07 evening, running through 2026-08-08.

Checked every 30 minutes. Newest entry at the bottom.

---

## THE HEADLINE, found at 08 minutes

**The two minds spawn 3.3 metres apart and are a kilometre apart within the
hour. After the first few minutes they cannot see each other, and from that
moment every social verb in the game is unreachable.**

This is a root cause, not a symptom, and it is traced end to end:

1. `SimWorld.addPlayer` (`src/sim/world.js:369`) fans joiners around one spot —
   *"everyone opens their eyes on the same shore."* Player two lands **3.3 m**
   from player one. They start as close as it is possible to start.
2. Both independently chose `hunt deer` in their first decision and walked off
   on different bearings. Neither has ever mentioned the other.
3. `AGENTS.noticeRange` is **140 m** (`src/config.js:986`). `Agent.brief()`
   drops any contact beyond it — `if (d > AGENTS.noticeRange) return;`
   (`src/net/agent.js:783`).
4. Past 140 m **the other player does not appear in the prompt at all.** Not as
   a distant figure, not as a name, not as a direction. They cease to exist.
5. **Every social verb takes a target the mind can only name from the brief** —
   `say` aside, `offer`, `accept`, `give`, `attack`, `follow` and `guard` all
   resolve through `find((label) => namesTheSame(label, g.target))`. A name that
   is not in the brief resolves to nobody and silently becomes `roam()`.

So within roughly the first ten minutes of any run, the six verbs shipped on
2026-08-07 become **physically unreachable**, and stay that way for ever.

**Measured, 26 samples over 8 real minutes:** closest approach **711 m**, mean
786 m, furthest 1026 m. Samples within 140 m (can see each other): **0**.
Samples within 3 m (can trade at all): **0**.

### Why this matters more than any other item on the list

- It explains today's run, and it retroactively explains **both** six-model
  playtests. "The models never coordinated" was never a fact about the models.
  They were each alone in a private world with the same weather.
- It explains why the **scripted control keeps winning**: a hundred lines of
  if-statements that never needed anybody else were never handicapped by this.
- It means the honest verdict on `give`/`offer`/`accept` is **still "untested"**
  after two days of work. The checks pass; the world has never given a model the
  chance to choose them.
- Any benchmark axis involving cooperation, trade, honesty or deception is
  currently measuring **zero divided by zero**.

### The fix, for the list (not built — the run is mid-flight)

Not "raise `noticeRange`" — 140 m is right for *seeing* somebody, and a mind
that can see a kilometre would have a prompt full of noise.

What is missing is that **people who know each other keep a rough idea of where
each other are.** Two crofters in a glen do not lose each other permanently
because one walked over a rise. Add a second, coarser channel to the brief:

> `also out there: Coinneach, a long way south-west`

— name and bearing only, no condition, no exact distance, for anyone on the
roster regardless of range. That single line restores every social verb, costs
almost nothing, and is defensible in real-world terms: you know your neighbour
is somewhere down the glen even when you cannot see him.

Pair it with `goTo <person>` resolving against that coarse channel, so a mind
that decides to go and find somebody actually can.

---

## Confirmed: the fire cost, and it is worse than Ben guessed

Ben's instinct that a fire should cost ~10 branches rather than 1 was correct,
and the data is blunter than the intuition.

**Eachann lit 21 fires** in the sampled window (a floor — sampling is every 20 s
and the board only keeps the last five deeds). Five of them at 19.37, 19.46,
19.54, 19.63 and 19.71 game-hours — **five fires inside 20 real seconds.**

At one branch each, `place` is the cheapest action in the game, and a model that
finds a cheap action repeats it. He is carrying 24 spare branches and has laid a
line of fires across the hillside like a man dropping breadcrumbs.

Two separate items fall out of this:

- **A1 (already on the list):** lighting costs ~10, feeding costs 1.
- **A new one — `place` looks like it is not rate-limited on the agent path.**
  `AGENTS.fireNearby` (9 m) is supposed to stop a mind laying a fire on top of
  one already burning, and something is getting past it. Worth an hour with
  `firecheck` before assuming the cost change alone fixes it.

---

## The other findings so far

**Nobody has said a single word.** 48 decisions between two models, both given
characters written to negotiate, and the `say` verb has been chosen **zero**
times. Given the headline above this is expected — you do not talk to somebody
who is not in the room — but it needs re-testing once they can find each other.

**The vocabulary is barely used.** Fifteen verbs available. Across both minds,
every intention ever recorded falls into five phrasings:

```
hunt deer
hunt deer right here to the west
go toward deer
pick up what is lying about
walk the country and see what is about
```

Never used: `say offer accept give attack follow guard makeCamp avoid hold`.

**But the quarry fix works, and that is a real win.** Between them: **55 arrows
loosed, 3 deer killed.** Before the fix, five models across ~400 decisions fired
**zero**. This is the first time paid models have hunted successfully in this
project.

**They cannot shoot.** 55 arrows for 3 kills is about a 5% hit rate, and 21 of
those arrows are logged as astray. The refusal log says why:

```
"ground in the way 11 m out"     ×3
"33 m short of the promise at 6 m, into the tree"    ×10
```

They are shooting **through hillsides and trees**. The `sight` field exists in
the brief (`'no clear line — ground in the way'`) but is only populated inside
the body's own bow range — so at 30-90 m a mind is told a deer is there and told
nothing about whether it can be hit. Candidate fix: state the line at any
distance the mind might shoot at, or refuse the shot upstairs rather than
downstairs.

**Coinneach is dying.** Health 43, food 0, at game hour 0.3. Killed a deer and
never ate it — it went `pick up what is lying about` over the carcass and came
away with **2 branches**, because `case 'gather'` navigates to
`nearestDeadfall` (firewood specifically) and dropped loot is not in the
snapshot at all. Eachann has `venison_cooked x2` and `hide x2`, so harvesting a
kill *is* possible — but on this evidence it is incidental rather than
something a mind can decide to do. **There is no verb that means "take the
meat".** Worth its own investigation.

**Model reliability.** Eachann (grok) **40 answered / 0 failed** — flawless, and
the cheapest seat available. Coinneach (kimi) **8 answered / 2 failed**, the
failures being `no json in reply`, which is the reasoning-budget symptom. That
is 80%, better than the 3-in-8 seen before but still the weak seat.

**Cost.** 50 calls, 40k in / 20k out, in the first 8 minutes. Tracking well
under the 14p/hour estimate.

---
