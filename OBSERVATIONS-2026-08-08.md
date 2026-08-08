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

## +30 min — game hour 20.4, 110 calls

### They are still diverging, and faster

Mean separation has doubled: **786 m → 1575 m**, furthest now **3166 m**. Over
91 samples, still **zero** within notice range. This is not two minds who
happened to drift; it is two minds actively walking away from each other for
half an hour, each with no idea the other is in the world.

### A MIND WITH AN EMPTY QUIVER SHOOTS FOR EVER — and is never told

Coinneach is carrying **one bow and nothing else**. No arrows, no wood, no food.
Its `loosed` count is **187 and still climbing** — it went 184 → 187 while I was
reading it.

It has no arrows. It is drawing on an empty bow, over and over, and nothing
anywhere tells it so:

- `brief().carrying` filters to `n > 0`, so an empty quiver appears as
  **absence** rather than as a statement. The model has to notice something
  *missing* from a list to infer it cannot shoot, which is the single thing
  language models are worst at.
- The body's shoot path does not check ammunition before drawing, so the mind
  gets no feedback either. It chooses `hunt deer`, the string goes slack, the
  deer does not die, and it tries again. 187 times.
- It cannot recover: making arrows needs wood *and* a fire, and it has neither.

**This is a death spiral the mind cannot perceive.** It is alive only because it
ate earlier — food went 0 → 37, health 43 → 100, so it did feed itself once —
but it can no longer hunt and does not know it.

**Fix, for the list:** state the pack in the negative when it matters — *"your
quiver is empty"* — and refuse the draw upstairs rather than miming it. Same
shape as the `sight` fix: a mind that cannot tell two situations apart is not
choosing between them, it is guessing.

### A correction to my own number

**I reported a "5% hit rate" earlier. That number is not trustworthy and I
should not have given it.**

`loosed` on the board counts entries in the agent's own `releases` log where it
*meant* to shoot (`src/net/agent.js:747`) — it counts **draws, not arrows**. For
a body with an empty quiver, every one of those is a phantom. Coinneach's 187 is
mostly nothing at all.

Eachann's figures are the ones worth quoting, because he has actually had arrows
throughout: **58 loosed, 36 astray, 4 kills** — and even that denominator is
inflated by whatever fraction of his draws were on an empty quiver between
crafting runs. The honest statement is: **accuracy is bad, and this project
cannot currently measure how bad.** Fixing the counter to mean "an arrow left
the bow" is a prerequisite for any combat axis in the benchmark.

### Kimi is getting worse, not better

**14 answered / 9 failed — 61%.** It was 80% at the eight-minute mark. All
failures are `no json in reply`, the reasoning-budget symptom, at
`maxTokens: 3000` and a 75 s cadence. Grok remains **87 answered / 0 failed**.

### Fire spam continues

**26 `place` deeds** for Eachann. He is down to 11 branches from 27 and has
spent the interval alternating between gathering wood and setting it alight.

### The verb list is still four words wide

Eight distinct phrasings across both minds in 110 decisions, every one of them
about deer or wandering:

```
hunt deer · hunt a deer · hunt deer right here to the west
go toward deer · go toward deer close to the north-west · make for deer
pick up what is lying about · walk the country and see what is about
```

Never chosen: `say offer accept give attack follow guard makeCamp avoid hold`.

---

## +60 min — game hour 1.6, 196 calls

### First, a correction: my separation figures were built on a broken metric

**The "786 m → 1575 m → 3166 m" numbers in the two entries above are not
trustworthy and should be ignored.**

The board reports position as prose — *"379 m south-west of Rowan Moor"*. My
analyser turned that into coordinates by giving each new landmark a synthetic
base one kilometre from the last. So whenever the two minds were quoted off
**different** landmarks, the tool invented a kilometre of separation and then let
me quote it back as a measurement. That is exactly the class of error this
project has already been burned by twice.

Rebuilt to compare **only samples where both minds are quoted off the same
landmark**. On that basis, out of 186 samples:

| | |
|---|---|
| comparable at all | **16** |
| not comparable (different landmarks) | 170 |
| closest | ~1 m — *see the caveat* |
| mean | 370 m |
| within `noticeRange` (140 m) | **2 of 16** |

**The caveat matters as much as the number.** Bearings are quantised to eight
compass points, so "349 m north-east" and "350 m north-east of Rowan Moor"
describes an arc roughly 275 m wide at that radius. Those two minds were
somewhere between 1 m and 275 m apart. **I cannot tell which, and neither can
anything else in this project.**

### The finding that replaces it: THEY CONVERGED, AND NOTHING HAPPENED

The raw position trace is more interesting than the botched statistic. Between
samples 163 and 181, both minds independently moved onto the same hill:

```
166  E: 424 m north-west of Heather Scaur   |  C: in Hollowed Beinn
173  E: 293 m north-east of Hollowed Beinn  |  C: 141 m east of Hollowed Beinn
175  E: 291 m north-east of Hollowed Beinn  |  C: 197 m north-east of Hollowed Beinn
181  E: 361 m north of Hollowed Beinn       |  C: 332 m south-east of Hollowed Beinn
```

At sample 175 they are on the **same bearing off the same landmark**, 94 m apart
in the crude model. They came from opposite ends of the map to orbit the same
hill for about ten minutes.

**And still: no `say`, no `offer`, no `give`, no acknowledgement of any kind.**

This is a better test of the A0 hypothesis than the run had any right to
produce, and it is genuinely ambiguous. Either they never got inside 140 m and
A0 still explains everything — or they did, and there is a *second* problem
underneath it: that a model given a companion in its brief does not find the
companion interesting enough to act on.

### THE BOARD CANNOT ANSWER THE ONLY QUESTION THAT MATTERS

**Nothing anywhere records whether one mind ever saw another.**

`Agent.brief()` builds a `contacts` list and the top two entries go into
`memory` — but the board serves `goal, why, health, food, where, carrying,
gold, kills, wounds, loosed, astray, intentions, deeds, strays, refusals,
said`. No contacts. No memory. So the single most important question in a
multi-agent run — *did these two minds perceive each other* — has no answer in
any artefact this project produces.

**This is the top instrumentation item on the list now.** Everything about
cooperation, trade, honesty and deception is unmeasurable until a run records
who could see whom, when.

### The arrow counter went backwards, and here is why

Coinneach's `loosed` read **187** last entry and reads **0** now. Not a
respawn — `kills` (2) and `astray` (17) both held across the change.

`releases` is a **ring buffer of 400** (`AGENTS.logSize`), and the board's
`loosed` is a *filter over whatever is currently in it*. Coinneach has released
the bowstring **400+ times in half an hour and not one arrow left the bow** —
enough let-downs to flush all 187 real shots out of the window.

`if (this._looseWhy !== 'aimed') this.intent.letdown = true;` — so every one of
those was the shot solver refusing. It is in a **permanent draw-and-abort
loop**, and it is now doing it *with 8 arrows and 28 branches in the pack*. It
recovered materially — gathered, built a fire, made arrows — and still cannot
shoot, because it keeps choosing targets behind terrain.

So the board's `loosed` is neither a lifetime total nor a rate: it is "how many
of the last 400 string-releases threw an arrow", which is a number nobody would
guess from the label. **Third instrumentation defect of the day.**

### Three broken numbers is a theme, not a coincidence

`loosed` counts intent rather than outcome. `loosed` is also a sliding window
that silently rolls over. Separation was computable only because my own tool
made a value up. **The board is a fine live dashboard and a bad instrument**,
and Part D of `IDEAS.md` — every ranking, every axis, every claim about which
model is better — is built on exactly these numbers.

Before any benchmarking work: a run must emit an **append-only event log** with
outcomes rather than intentions, and the dashboard should be a *view* of that
log rather than the only place the data exists.

### Everything else

- **Kimi has halved again: 20 answered / 20 failed — 50%.** It was 80%, then
  61%. All `no json in reply`. Grok remains **155 / 0**.
- **Eachann has run out of arrows too** — carrying `bow, hide x2, wood x2` with
  6 kills to his name. Both minds are now unarmed hunters.
- **Fire spam:** 31 `place` deeds and climbing.
- **The vocabulary widened, which is the one encouraging sign.** New this hour:
  *"keep away from a goblin"*, *"stay still and watch"*, *"make for Hollowed
  Beinn"* — the first avoidance, the first deliberate pause, and the first time
  either mind has navigated to a **named place** rather than to an animal.
  Eachann is up to 29 distinct intentions from 7.

---

## +90 min — game hour 3.8, 274 calls

### THE FINDING OF THE DAY, and it revises A0

**Both minds are fully aware of each other. Both act in character. And one of
them formed the exact trade we built the `offer` verb for — then failed to use
it.**

Here is the whole thing in six lines, taken verbatim from the intention log:

```
Coinneach  2.79h  make for Hollowed Beinn      | shelter from rain and FIND THE OTHERS
Coinneach 11.02h  go toward dead deer south    | starving, taking the close meat
Eachann   13.16h  pick up what is lying about  | claim dead deer meat before goblins or OTHERS
Coinneach 13.94h  go toward Eachann            | OFFER BRANCHES FOR SOME OF THAT MEAT
Eachann   14.01h  make for dead deer south-west| get meat before others
Eachann   16.57h  pick up what is lying about  | claim the dead deer meat before COINNEACH
Eachann   22.98h  keep away from Coinneach     | HOARD MY OWN MEAT
```

**Coinneach — the one written as *"blunt, asks for what he needs rather than
going without"* — worked out that it had firewood and no meat, that Eachann had
meat, and that these facts could be resolved by a barter. It said so in plain
English. Then it chose `approach`.**

**Eachann — written as *"You hoard. What you pick up is yours and you do not
hand it over for nothing"* — named Coinneach as a rival for a carcass, and then
deliberately walked away from him to protect his stores.**

### What this means, and what it costs A0

**A0 is still real but it is no longer the whole story.** They *did* get inside
notice range; they *did* see each other; the social verbs *were* reachable. And
they still went unused.

The corrected diagnosis is more interesting than the original:

> The models understand the social situation completely. They express trade
> intentions, rivalry and avoidance in plain English in the `why` field. **They
> simply do not select the verbs.**

Two concrete causes, both small to fix:

1. **The prompt does not say that `offer` and `give` include the walk.**
   `case 'offer'` already resolves to `{ x, z, within: REACH, act: 'offer' }` —
   it walks you there. Coinneach did not know that, so it treated "go to him"
   and "offer him something" as two steps and only ever got to spend a decision
   on the first. At a 75 s cadence with a 50% failure rate, the second step
   never landed.
2. **`approach` is a cheaper, safer choice than `offer`.** `approach` needs one
   argument; `offer` needs three (target, item, want) and any one of them wrong
   makes it a no-op. Given a hard verb and an easy verb that both move you
   toward the goal, a model takes the easy one — and gets no feedback that the
   hard one was the point.

### THE PERSONAS ARE WORKING — first hard evidence in this project

This is the answer to the question `A4` (the truthful-Tormod control) was
designed to settle, and it arrived free.

| written character | what it actually did |
|---|---|
| Coinneach: *"asks for what he needs rather than going without"* | *"shelter from rain and **find the others**"*, then *"go toward Eachann — **offer branches for some of that meat**"* |
| Eachann: *"You hoard. What you pick up is yours"* | *"**my meat now, not yours**"*, *"claim the dead deer meat **before Coinneach**"*, *"**keep away from Coinneach — hoard my own meat**"* |

One mind sought company and proposed a barter; the other named him as a rival
and fled with the stores. **Persona text changes behaviour, not just
narration.** That is a real, previously-unevidenced result and it makes every
personality axis in Part D worth building.

It also makes the A4 control **more** valuable, not less: now that we know
character text moves behaviour, the question of *how much* and *how reliably* is
worth a proper same-seed A/B.

### Eachann has noticed Ben

```
Eachann 16.99h  walk the country and see what is about | protect my meat from Ben
```

The hoarder clocked the human player and adjusted. Nobody prompted that.

### The insight underneath all of it

**The `why` field is where the intelligence is, and the goal field is where it
gets thrown away.** Every genuinely sophisticated thing either model has done
today — the barter plan, the rivalry, the avoidance, noticing Ben — is in the
one-line reason, and none of it survived into an action the world could resolve.

For Part D this is a design principle, not a footnote: **a benchmark that scores
only outcomes would rank both these models at zero on trade, which is plainly
the wrong answer.** Score the reasons too, and score the gap between them —
"understood the situation but could not act on it" is a completely different
failure from "never understood it", and only the second is the model's fault.

### Everything else this interval

- **They are together now.** 44 of 60 comparable samples inside 140 m, mean
  113 m — against 2 of 16 last interval. The convergence held.
- **Eachann is hurt: health 100 → 65.** He has 7 kills and has been avoiding
  goblins by name, so something got a hit in.
- **Kimi: 30 answered / 27 failed — 53%.** Stable at about half.
  Grok: **217 / 0.**
- **`astray` (89) now exceeds `loosed` (64)** for Eachann, which is arithmetic
  nonsense — strays should be a subset of shots. They are two different ring
  buffers with different sizes and different windows. **Fourth instrumentation
  defect**, same root cause as the other three.
- **Fire spam: 35 `place` deeds.** Unchanged in character.
- **The vocabulary keeps widening** — 39 distinct intentions for Eachann, 15 for
  Coinneach, now including `find shelter and settle for the night`, `make for
  Sunny Muir`, and carcass navigation. Still zero `say / offer / accept / give /
  attack / follow / guard`.

---
