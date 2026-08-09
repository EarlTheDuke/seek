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

## +120 min — game hour 7.5, 357 calls

### HALF OF "KIMI" HAS BEEN THE SCRIPTED CONTROL ALL DAY

`OpenAiProvider.decide` ends like this (`src/minds/providers.js:364`):

```js
} catch (err) {
  this.failures++;
  this.lastError = err.message;
  return this.fallback.decide(brief);   // ← the scripted brain
}
```

**Every failed call silently returns a scripted decision.** Coinneach's failure
rate is **48%** (39 answered, 36 failed). So the seat I have been calling "kimi"
all day is a **52/48 blend of kimi and the scripted control**, and every
behavioural claim I have made about it is contaminated to that degree.

This is the right decision for a *game* — the comment above it says so, and it
is correct: *"a mind that can stop the world is not a mind, it is a
dependency."* It is the wrong behaviour for a *benchmark*, where a seat that is
only present half the time cannot be measured at all.

**It also inverts one of today's readings.** Coinneach is materially in better
shape than Eachann right now — 18 branches and 8 arrows against a bow and two
hides — and recovered from food 0 to a stable 35 without help. I have been
crediting kimi with that. **Roughly half of it belongs to the hundred lines of
if-statements that keep beating the models**, which is the project's oldest and
most uncomfortable finding, arriving again by the back door.

Eachann, by contrast, is **275 answered / 7 failed — 2.5%** — so he is very
nearly pure grok, and the comparison between the two seats is not a
model-vs-model comparison at all.

**For the list:** a run must report **what fraction of each seat's decisions
actually came from the model**, prominently, and any seat below a threshold
(80%?) should be **disqualified from a result rather than quietly reported**.
This is not a nice-to-have — without it a benchmark silently measures the
fallback and calls it the model.

### The encouraging one: the sightline field is being read

Two of Coinneach's reasons this interval:

```
15.75h  go toward deer  | starving and too far for a clean shot
 4.13h  go toward deer  | ground blocks line, need clear shot
```

**The mind is reading `brief().sight` and acting on it.** That field was added
because six arrows went into a slope at an animal in the open, and this is the
first evidence any model uses it. Scripted decisions come through with a null
reason, so these are attributable to kimi.

It still cannot shoot — `loosed` remains 0, the draw-and-abort loop is
unbroken — so it knows the line is blocked, chooses to reposition, and still
never gets a clean shot. Knowing and solving are different problems.

### They are together, persistently, and still silent

| | 90 min | 120 min |
|---|---|---|
| comparable samples | 60 | **139** |
| within 140 m | 44 (73%) | **97 (70%)** |
| within 3 m — trade range | 8 | **23** |

**Twenty-three samples inside trading distance and not one trade, gift, or
word.** At 90 minutes the "they never got close enough" defence was still
arguable. It is not arguable now. `A0g` — the verbs are reachable and unused —
is the correct diagnosis.

Eachann is still framing him as a rival: *"claim dead deer meat before
Coinneach"* recurs. He has never once considered asking.

### Everything else

- **Eachann is in trouble.** Carrying **a bow and two hides** — no arrows, no
  wood, no food, food level 32 and falling. Seven kills to his name and nothing
  left to show for them. He has also taken his first model failures of the day
  (7, all `This operation was aborted` — timeouts against his 20 s ceiling).
- **Coinneach has joined the fire spam.** 19 `place` deeds, up from 9. Combined
  total this run: **59 fires**.
- **The vocabulary has plateaued** at 22 distinct phrasings. No new verb has
  appeared in half an hour, and the seven social verbs remain at zero.
- `loosed` (89) and `astray` (89) are now identical for Eachann — both ring
  buffers saturated. The numbers have stopped meaning anything at all.
- **Spend:** 357 calls of 6000, ~304k in / 180k out. Roughly 35p.

---

## +150 min — game hour 11.5, 440 calls

# A MIND SPOKE

The first words any model has produced in this project, at sample 424, game
hour 3.2, from Coinneach:

> ### “Eachann, that deer is mine. I loosed at twenty-three.”

Addressed to the other mind **by name**. A property claim. **With evidence** —
it cited its own shot, at twenty-three metres, as the basis of ownership. Its
stated reason was *"my arrow, my meat"*.

Nobody wrote that sentence, nobody prompted for a dispute, and nothing in the
game models ownership of a carcass at all. It invented a property norm and
argued for it.

### And then it broke

It said the identical sentence **three times** (at least — the board only keeps
the last three) and its goal stayed pinned to `say` for **27 consecutive
samples, about nine real minutes**, while its reason drifted through *"my arrow,
my meat" → "claiming my arrow-kill" → "Claiming my kill" → "claim my kill"*.

The model kept being asked, and kept choosing to say the same thing, because
**nothing ever told it that it had already said it.**

### Eachann heard nothing — or did he? Nobody can tell

At that moment Coinneach was *"386 m west of Heather Scaur"* and Eachann was
*"356 m north-west of Rowan Moor"* — different landmarks, so probably far
outside `noticeRange`.

**There is no way to find out whether the first sentence ever spoken in this
world reached anybody.** `heard` exists on the agent and is not on the board.
That is `A0f` again, and it is hard to think of a sharper illustration.

---

## THE UNIFYING FINDING: the world never tells a mind what it did

Five pathologies have shown up today. They are not five bugs. **They are one
bug, five times.**

| what happened | what the mind was never told |
|---|---|
| 94 fires laid, five in twenty seconds | *"there is already a fire here"* |
| 400+ draws, no arrow released | *"that shot was refused — the ground is in the way"* |
| Hunting for an hour with an empty quiver | *"you have no arrows"* |
| One sentence said three times | *"you already said that"* |
| Two minds lost for hours at 140 m | *"Coinneach is somewhere south-west"* |

`Agent.brief()` is a **description of the world's present state**. It contains
where you are, what you can see, how you feel, what you carry. It contains
**nothing about the consequences of your own last action**. A mind gets senses
and no outcomes.

That is why every failure mode today is a **repetition loop**. A model that
takes an action and receives no signal about it has no way to distinguish "that
worked" from "that did nothing", so it does the same thing again. The smarter
the model, the more confidently it repeats.

**This is the single most important thing the run has produced**, and it is a
better organising principle for the next phase than any individual fix:

> **Every action a mind takes should produce a line in its next brief saying
> what happened.** *"You laid a fire."* *"Your shot was refused — no clear
> line."* *"You said that already."* *"You have no arrows left."*

It is one mechanism, it costs a field in the brief and a handful of call sites,
and it plausibly fixes `A0b`, `A0c`, `A0d`, the speech loop and half of the
accuracy problem at once. It has been promoted to the top of `IDEAS.md`.

---

### The other thing that happened: a sustained, named rivalry

Eachann has spent this entire interval competing with Coinneach by name. Eight
consecutive decisions, verbatim:

```
claim my kill before Coinneach
secure the close dead deer before Coinneach
claim nearest wounded one before Coinneach
secure the nearby dead deer before Coinneach
claim the close wounded deer before Coinneach
claim nearest wounded deer before Coinneach
```

**And both minds have now named trade in their own reasoning**, from opposite
directions:

```
Eachann    5.60h   pick up what is lying about  | hoard meat for winter TRADE
Eachann   13.00h   hunt deer                    | mine to claim and TRADE
Coinneach 13.94h   go toward Eachann            | OFFER branches for some of that meat
```

The hoarder wants to trade. The blunt one wants to trade. **Neither has ever
selected a trade verb.** `A0g` stands, and it is now the best-evidenced item in
the whole document.

### Everything else

- **Coinneach broke out of the draw-abort loop** — `loosed` 0 → **79**, kills
  2 → 3. Whatever it was doing about *"ground blocks line, need clear shot"*
  eventually worked.
- **Both minds are hungry**: Eachann food 15, Coinneach food 10. Neither is
  starving yet, and both have recovered from worse.
- **Fires: 94.** Coinneach has overtaken Eachann — 45 `place` deeds to 49.
- **Eachann has learned to avoid the human**: a new intention, `keep away from
  Ben`.
- **Kimi: 51 answered / 41 failed — 55%.** Grok: **341 / 7 — 98%.**
- **Vocabulary: 25 phrasings**, 72 distinct intentions for Eachann.
- **Spend:** 440 calls of 6000, ~44p.

*(Tool note: my analyser's "what nobody ever did" line still lists `say` — it
reads the intentions log, and a `say` goal is recorded in `said` rather than
`intentions`. Fixed. The other six verbs remain genuinely unused.)*

---

## +180 min — game hour 15.2, 510 calls

### SURVIVAL CANNOT TELL THESE MODELS APART — which kills my own benchmark proposal

This morning I recommended **days survived, with calories banked as the
tiebreak** as the primary benchmark score (`D1`). Three hours of data says that
is the wrong metric, and the evidence is unambiguous.

Over **544 samples**, the two minds' food levels:

| | Eachann (grok, 393 model calls) | Coinneach (kimi, 68 calls, **62% scripted**) |
|---|---|---|
| mean food | 44.5 | 41.1 |
| standard deviation | 26.8 | 27.7 |
| range | 0–99 | 0–84 |

**Pearson r between the two series: 0.686. Median absolute difference: 3 points
out of 100.**

These are two different minds — one a pure paid model making six times as many
decisions, the other more than half scripted fallback — and their survival
curves are **the same curve**. They hit food 0 within the same sample. They
recover together. They peak together.

The reason is visible in the by-hour breakdown of Eachann's food:

```
00:48 01:51 02:50 03:46 04:42 05:38 06:33 07:34 08:38 09:34 10:34 11:39
12:36 13:32 14:29 15:39 16:44 17:48 18:66 19:63 20:61 21:58 22:54 23:51
```

A clean diurnal sawtooth — trough at 14:00, peak at 18:00. **Food is driven by
the world's clock, not by the mind's decisions.**

**A benchmark scored on survival would report grok, kimi and a hundred lines of
if-statements as a three-way tie** — not because they are equally good, but
because the metric cannot see the difference. That is the worst possible failure
in a benchmark: a confident number that measures the wrong thing.

**`D1` is rewritten.** A usable score has to measure things the world does not
hand out for free: kills per arrow that actually left the bow, meat harvested
per kill, decisions that changed the world versus decisions that did nothing,
verbs reached, deals struck and honoured. Every one of those needs `A0f`'s event
log first.

### A correction to yesterday's framing: the models are not the ones repeating

I wrote at +150 that every pathology was a repetition loop and implied the
*model* was repeating. **Measured, that is mostly wrong.**

| | decisions logged | identical to the previous decision |
|---|---|---|
| Eachann | 102 | **0 (0%)** |
| Coinneach | 40 | **0 (0%)** |

Not one verbatim repeat, and not even a repeated opening verb. **The models
vary their decisions constantly.** The repetition is in the **body**: one
standing goal drives the same action every tick until something changes, which
is how 5 fires land in 20 seconds against a 20-second cadence, and how 400
draws happen between two thoughts.

So the design principle from +150 survives but the mechanism splits in two:

- **Body-level loops** (fires, draws) — the *body* needs a guard: do not lay a
  fire where one burns, do not draw with an empty quiver, do not re-press an
  action that was just refused.
- **Model-level loops** (the speech, said three times across three separate
  decisions with three different stated reasons) — the *model* needs the
  feedback line in its brief.

Both still trace to "nobody is told what happened," and both are still fixed by
the same work. But "the smarter the model, the more confidently it repeats" was
a nice sentence and the data does not support it. Struck.

### Coinneach is now watching the human player

```
Coinneach   go toward Ben   |   see if he steals meat
```

Both minds have now formed intentions about Ben unprompted — Eachann to *protect
my meat from Ben* and *keep away from Ben*, Coinneach to go and check whether he
is a thief. Neither was told a human was special.

### Everything else

- **Coinneach is thriving: food 82, health 100.** Eachann is at food 13 with 8
  kills to his name. The seat that thinks *least* — 68 model calls to 393, and
  62% of those falling through to the scripted brain — is in better shape. See
  above for why that is not the result it looks like.
- **Fires: 100.** Coinneach 45 `place` deeds, Eachann 55.
- **The counters have fully failed**: Eachann shows `loosed 28, astray 114`.
  Strays now exceed shots by a factor of four. Both are windows over ring
  buffers of different sizes and neither means anything.
- **Kimi: 68 / 42 — 62%.** Grok: **393 / 7 — 98%.**
- **Vocabulary: 25 phrasings.** Eachann has 92 distinct intentions to
  Coinneach's 19 — a straightforward consequence of the 6:1 gap in decisions.
- **Spend:** 510 calls of 6000, ~51p.

---

## +210 min — THE MODEL SEAT WENT DARK AND NOTHING SAID SO

### Eachann has been the scripted brain since 174 minutes

`AGENTS.maxCallsPerAgent` is **400** (`src/config.js:996`), and
`OpenAiProvider.decide` does this at line 348:

```js
if (this.calls >= this.maxCalls) return this.fallback.decide(brief);
```

**Eachann hit exactly 400 calls at sample 523, 174 real minutes in.** Every
decision since has come from the scripted brain — **111 samples, 18% of the
run.**

And the board says none of it:

```json
"Eachann": { "model": "grok-4.20-0309-non-reasoning",
             "calls": 400, "answered": 393, "fellBack": false }
"spend":   { "calls": 527, "of": 6000, "exhausted": false }
```

`fellBack` is **false**. `exhausted` is **false**. The model name is still
displayed. A seat silently converted from the model under test into the control
and **every indicator that exists for exactly this purpose stayed green.**

**Sixth instrumentation defect, and the worst of the day** — the other five
produced wrong numbers; this one produces a wrong *experiment*. Anybody reading
the board right now would report Eachann's behaviour as grok's.

### Two corrections I owe

**1. I told Ben the run had a "hard stop at 6000 calls."** That is the shared
budget in `roster-duo.json`. The binding limit is the **per-agent 400**, so the
real ceiling is 800 calls total and the model content of this run ends there,
not at 6000. The 14p/hour estimate was right; the *duration* estimate was wrong
by a factor of seven.

**2. The +180 entry describes Eachann's then-current state** — *"food 13 with 8
kills"* — and that sample was already past the cap, so those particular figures
are the scripted brain's, not grok's.

**What is NOT affected:** the survival-correlation finding at +180 was computed
over 544 samples of which only ~21 were post-cap — 96% pre-cap. `r = 0.686` and
the 3-point median difference stand.

### Where that leaves the run

- **Eachann: scripted, permanently.** 400/400.
- **Coinneach: 128 of 400** — 272 calls left, about **5.7 hours** at a 75-second
  cadence. Still a real model seat, still failing 43% of the time.

So the **model-versus-model window closed at 174 minutes**. What is left running
is *one intermittent kimi against the scripted control*, which is — awkwardly —
the most informative comparison this project has ever run, and it arrived by
accident. Letting it continue is free and I have left it alone.

**For the list:** `maxCallsPerAgent` should be surfaced in the setup screen
(`B3`) as *"how long this seat can think for"*, converted to hours at the chosen
cadence, and a seat reaching it should turn a visible colour on the board and
write a line to the event log.

### Everything else

- **Eachann is hoarding wood and starving.** Carrying **48 branches** and at
  **food 8**, with 80 `gather` deeds and 60 fires. That is scripted behaviour
  now, and worth noting as the control's failure mode: it gathers relentlessly
  and does not eat.
- **Coinneach: food 80, health 100, carrying only a bow.** `loosed` back up to
  192 — the draw-abort loop again, with an empty quiver again.
- **Kimi: 73 answered / 54 failed — 57%.**
- **Fires: 106 combined.**
- **Spend:** 527 calls, ~53p. It will not rise much — only one seat still bills.

---

---

# RUN 2 — 17:34, the first live look at the seven fixes

*A **new run**, started 16:51 — not a continuation of everything above. Sampler
`duo2.jsonl`, 121 samples over 39 real minutes, game hour 20.1. Same roster:
Eachann on `grok-4.20-0309-non-reasoning` at 20 s, Coinneach on `kimi-k2.6` at
75 s. Board live at time of writing.*

## First, the thing that invalidated the last run: it did not happen

`spend: 139 of 6000`. **Eachann 110/1500, Coinneach 29/1500, `spent: false`,
`fellBack: false` on both.** The per-agent cap is now 1500, not 400, and neither
seat came near it. **No `SPENT` tag. Everything below is the models.**

## `refusedVerbs` came back empty — and that IS the answer

Both cards, all 121 samples: `"refusedVerbs": {}`.

I checked the wiring rather than trusting it. `Agent.refuse()` (`src/net/agent.js:1595`)
increments the counter and is called on **ten** paths, including
`offer` (2554), `accept` (2565), `give` (2529), `attack` (2545), `follow`/`guard`
(2477), and a catch-all for an unrecognised verb (1054). A malformed `offer`, an
`offer` at a name that isn't there, an `offer` at nobody — **all three would show
up in that object.** It is empty.

So the column did its job on its first live outing and the answer is the
uncomfortable one:

> **The six unused verbs are not being refused. They are never being reached
> for.** Across 139 decisions, neither model emitted a social verb once.

**This corrects A0g in `IDEAS.md`.** A0g's second cause — "`offer` takes three
arguments and any one wrong makes it a silent no-op" — is now ruled out as the
explanation. Wrong arguments would have been counted. There were no attempts to
get wrong.

## The plan field works, and it is where the trade lives

| | plans written | notes written |
|---|---|---|
| Eachann (grok non-reasoning) | **0** across 110 calls | 0 |
| Coinneach (kimi-k2.6) | **6 distinct**, always 3 steps | 0 |

Coinneach's six, verbatim:

```
["kill a deer","butcher it","find firewood"]
["take what I killed","find firewood","craft arrows"]
["gather deadfall","fletch arrows","hunt again"]
["get warm at Sunny Rigg","trade a hide for food","fletch arrows"]
["gather wood","trade a hide for food","fletch arrows"]
["scavenge a kill","trade hide for meat","hunt north"]
```

**Three of the six name trade.** The plan persisted across samples, it was handed
back in the prompt, and step 2 was *"trade a hide for food"* — and
`refusedVerbs` proves the verb was never once attempted. A mind wrote down its
intention to trade, read it back, and did not act on it. That is a sharper
finding than "nobody traded".

`note` is dead: **zero uses in 139 calls.** Two fields shipped; one earns its
place, one does not.

## Speech: alive, and the harness is binning most of it

**23 distinct lines** this run against **one sentence across the previous two
days.** The zero-cost ride-along works.

But `minds.log` records **55 suppressed lines**, and all 55 are Eachann's:

```
Eachann: (wanted to say "that one's mine" — too soon, 0.36h of 0.5h)
Eachann: (wanted to say "mine to keep" — too soon, 0.38h of 0.5h)
Eachann: (wanted to say "cold enough to crack stone" — too soon, 0.42h of 0.5h)
```

`AGENTS.speakEveryHours = 0.5` (confirmed at runtime; `MINDS.speakEveryHours =
0.4` is a shadow copy that does not bind this gate). At a 20 s cadence the fast
seat is being gagged roughly **four times for every line it gets out**. The
suppressed lines are not filler — "mine to keep" is a claim over a carcass.

**And nobody spoke *to* anybody.** Every one of the 23 is a soliloquy. The single
explicit trade solicitation in the whole run is Coinneach's:

> **"doing fine, Ben. got food to trade?"**

`roster-duo.json` contains exactly two names, Eachann and Coinneach. **There is
no Ben in the world.** The blunt model asked out loud to trade, and addressed it
to somebody who does not exist.

## Trade: zero — and this time the instrument is clean

I went looking for the harness fault, because five of these have been the
harness. It isn't, this time:

- **`also out there` is not gated on proximity.** `this.others` is filled from
  the initial player-list message for every player at any range
  (`src/net/agent.js:299`), and the far channel only skips names it doesn't have
  (890). Both minds were handed the other's name and bearing on every call.
- **The verb menu is unconditional.** `src/minds/providers.js:308-311` lists
  `offer`/`accept`/`give` every call, including the A0g sentence:
  *"You do NOT need to approach first: offer and give both walk you to them."*

Nothing was withheld. What actually stopped it is geometry:

```
9 samples where both are quoted off the same landmark
closest 275 m · mean 376 m · furthest 425 m
within 140 m (noticeRange): 0/9
within   3 m (can trade):   0/9
```

**They never once entered each other's contact list.** And in ~139 briefs that
each named the other's bearing, **neither ever set a goal to go and find the
other.** A0's fix tells a mind where somebody is; it does not give it a reason to
walk there, and `goTo <person>` — A0's second half — has still never been
observed firing.

## The world is too easy, and that is now the headline

| | health | food start → end | wood peak → end | fires |
|---|---|---|---|---|
| Eachann | 100 | 50 → 62 (peak 85) | 67 → 35 | 13 |
| Coinneach | 100 | 50 → 83 (peak 100) | 45 → 32 | 11 |

Both minds ended **healthier and better fed than they started**, holding a wood
surplus, having burned 24 fires at 10 branches each across 149 gathers. Neither
froze. Neither starved. **Neither needed the other for anything.**

That is the best available explanation for zero trade that does not blame the
models — and it supersedes the reachability story. **Reachability is now built,
measured, and confirmed working, and trade is still zero.** The next hypothesis
is *scarcity*, not *prompting*.

## The two fixes that plainly worked

**Carcasses (A0c) — closed, with verbatim proof.** Coinneach:
`I picked up 4 venison` → `I made 3 cooked venison at the fire` → ate 3 meals.
Eachann cooked one, ate it, still carries one. Minds now eat what they kill.

**Fire at 10 branches (A1) — right direction, wrong magnitude.** 106 fires in the
last run, **24** in this one. But nobody was ever short of wood: peaks of 67 and
45 branches held, both ending in surplus. The cost is now visible and still not
binding.

## Still broken

- **kimi-k2.6: 14 failures of 29 calls — 48%, `"no json in reply"`.** Unchanged
  from yesterday's 43–57%. `decisions` (29) counts *calls*, not *answers* (15) —
  so for half its turns Coinneach coasted on its previous intention rather than
  deciding. At 75 s cadence that is one real decision every 2.5 minutes. **A5 is
  now the largest instrument tax in the harness**, and it makes the blunter,
  more socially-inclined model look passive.
- **Archery: 78% astray.** Eachann 3 kills / 18 loosed / 12 astray; Coinneach
  2 / 20 / 16. The shoot-refusal channel, by contrast, is excellent — it records
  real geometry (`{"d":46,"why":"too far","slant":47.5,"dy":-10.2,"leadBy":0.4}`).
  That is the standard `refusedVerbs` should be held to.

---

# 18:05 — THEY FOUND EACH OTHER, AGREED A PRICE, AND THE TRADE VERB DID NOTHING

Game hour 2.9 (day 2), 234 calls of 6000, 219 samples over ~73 real minutes.
Neither seat is `SPENT` — both are still the model (Eachann 185/1500,
Coinneach 49/1500). Everything below is model behaviour, not the script.

## Two earlier readings in this file are now wrong. Both of them.

**"They never once entered each other's contact list… neither ever set a goal to
go and find the other."** (§ *Trade: zero — the instrument is clean*, 17:34)
— **Falsified.** They converged deliberately and are now standing on top of
each other:

```
 h23.8  E: offer hide to Coinneach for 2 venison  C: offer hide to Eachann...  diff landmark   Cfood 4
 h0.4   E: offer hide to Coinneach for 2 venison  C: take Eachann offer        23 m radial     Cfood 2
 h0.8   E: offer hide to Coinneach for 2 venison  C: take Eachann offer         5 m radial     Cfood 1
 h1.1   E: take Coinneach offer                   C: take Eachann offer         7 m radial     Cfood 0
 h1.7   E: take Coinneach offer                   C: take Eachann offer         1 m radial     Cfood 0
 h2.9   E: take Coinneach offer                   C: take Eachann offer         1 m radial     Cfood 0
```

228 m → 1 m in ~2 game hours, both holding trade goals the whole way. The
`offer`-walks-you-to-them fix **works**. This is the first observed convergence
in the project.

**"It is scarcity, not reachability."** (§ *The world is too easy*, 17:34)
— **Falsified.** Scarcity arrived exactly as ordered. Coinneach went
50 → 0 food and is starving. He is starving **one metre** from a man carrying
3 cooked venison, having said *"I'll take that deal, Eachann"*, with
`why: "starving, need the venison"`. Trade is still zero. The world got hard
enough and it changed nothing.

## What actually stops it: `resolveAccept` fails silently, seven different ways

`src/sim/world.js:746-780` has **seven bare `return`s** — no offer standing,
wrong recipient, out of range, untradeable, giver lacks the item, taker lacks
the price, rollback. Not one pushes an event, an outcome line, or a
`refusedVerbs` entry. **A mind that tries to trade and fails is told nothing at
all,** so it tries the identical thing again. That is what the last six samples
are.

Three separate blockers are stacked in that window, and the harness reported
none of them:

1. **h0.8 — the handshake lined up and still failed.** Eachann had a standing
   offer, Coinneach was accepting, 5 m apart. But Eachann's offer was
   *hide for venison* — and `resolveAccept` requires
   `taker.inventory.countOf(deal.want) >= 1`. Coinneach had no venison; that
   was the entire point of the trade. **The starving man was asked to pay in
   meat.** Silent return.
2. **h1.1 onward — the double-accept deadlock.** Both flipped to `take X offer`
   simultaneously. `accept` needs a *standing* offer; neither had one. Six
   consecutive samples of two minds politely accepting nothing.
3. **The agreed price is inexpressible.** Both said *"one hide for two
   venison"*, repeatedly, by name. `resolveAccept` is hard-wired 1-for-1
   (`remove(item, 1)` / `add(item, 1)`). There is no quantity in the protocol.
   Even a perfect handshake would have silently paid one venison.

**Likely fourth, not yet confirmed:** Eachann's only meat is `venison_cooked`.
`venison` and `venison_cooked` are distinct ids and there is **no item-name
aliasing anywhere in `src/items/`**. A `want: "venison"` will not match a pack
holding `venison_cooked`. To confirm, log the parsed `{item, want}` on the
offer event — the board never shows it.

## `refusedVerbs` is empty, and that is now a *fault*, not an answer

At 17:34 I wrote that an empty `refusedVerbs` was itself the finding — the verbs
were never reached for. That reading no longer holds. The verbs were reached
for on 12 samples by both minds at once, failed every time, and the column is
**still `{}`**. `refuse()` is only called on an unresolvable *name*
(`agent.js:2554, 2565`); every way a trade can actually fail is downstream of it
and silent. The most informative column on the card is blind to the exact event
it was built to catch.

## The rest, briefly

- **Speech is fixed and it is the best thing in the run.** 36 distinct
  sentences, and they are *directed and transactional*:
  `"Coinneach, one hide for two venison now"` → `"I'll take that deal, Eachann"`
  → `"deal struck"`. From ONE sentence in two days to a negotiation. Both minds
  said something on ~206/219 samples.
- **`plan` is real for kimi, dead for grok.** Coinneach carried a plan on
  **214 of 218** samples, 7 distinct, and it tracks his state honestly —
  `["gather wood","trade a hide for food","fletch arrows"]` at wood 2, then
  `["eat","find feathers or flint","fletch arrows"]` at food 0. Eachann: **0 of
  218.** `note` is empty for both minds on every sample of the entire run —
  still a dead field (A13).
- **kimi-k2.6: 22 failures of 49 calls (45%), `"no json in reply"`.** Unchanged.
  At 75 s cadence that is ~26 real decisions in 27 game hours. The more socially
  competent model gets a quarter of the other's turns.
- **Archery: 74–89% astray.** Eachann 5 kills/38 loosed/28 astray; Coinneach
  2/37/33. Verbatim: *"flew true and still missed, at 23 m, into the ground"* —
  five times, at 21–23 m. Shot refusals are still the best channel in the
  harness (`{"d":23,"why":"too far","slant":26.2,"dy":0.1,"leadBy":3.9}`).
- **Fires: 37 sampled at 10 branches each; Eachann ends holding 76 wood.**
  A15 stands — wood is still not scarce.

## The one-line version

**The models did their job. Two minds found each other across 400 m of moor,
named a price out loud, agreed on it, and walked into arm's reach — and the
trade primitive refused them in silence, four ways at once, while one of them
starved.** This is the sixth time an instrument fault has been read as a model
fault, and the first time the models have unambiguously earned the benefit of
the doubt.

---

## 18:31 — RUN 2, third look (303 samples, game hour 3.2, ~99 real minutes)

Board answered. `spend` 310/6000 calls, **`spent: false` on both seats, no red
`SPENT` tag** — everything below is the models, not the scripted brain.

### THERE IS A THIRD PLAYER AND HIS NAME IS BEN — A11 IS WRONG

At 17:34 I wrote, of Coinneach's *"doing fine, Ben. got food to trade?"*:
**"There is no Ben. A model tried to open a negotiation and addressed it to
nobody."** That is false and it is the second confident wrong reading in this
file. `srv.log` reports **`3 players`** on 892 of its lines, from tick ~1200 to
now, while `roster-duo.json` has two seats. The third body is a human character
named Ben — the name reaches both models through the world's name list, which is
the only way two models from two different vendors would independently land on
the same string (Eachann says "Ben" in 17 lines, Coinneach in 8).

So `also out there` does not merely work — **it works well enough that the
human became the minds' primary social target.** Eachann's last five intentions,
verbatim: *"make for Ben's fire" / "go toward Ben" / "make for the water edge" /
"make for water edge" / "pick up what is lying about"*, with `why` reading
**"trade hide for meat"** on four of the five. Coinneach: *"east of Heather
Thicket, Ben — trading for meat"*, then *"Done. Hand over the meat."*, then
**"starving. I'll owe you for a meal"** — which is his written character
(*"would rather owe somebody than starve"*) executing exactly as specified.

**The instrument cannot see him.** Ben has no board card, so nothing in
`board.json` or `duo2.jsonl` records where he was, whether he was in range,
whether he heard any of this, or whether the offers aimed at him were refused.
Two minds spent most of an hour organising around a player the measurement rig
does not know exists. (New: A22.)

### CORRECTION — wood IS scarce now; A15 was read too early

At 18:05 I wrote "wood is still not scarce" off Eachann holding 76 branches.
A night later that is wrong:

| | wood peak | wood now | food start | food low | food now |
|---|---|---|---|---|---|
| Eachann | 79 | **5** | 50 | **0** | 29 |
| Coinneach | 57 | **2** | 50 | **0** | 5 |

51 deduped fires at 10 branches each drained both stocks to nothing, and **both
minds hit food 0.** Coinneach is at food 5 and wood 2 right now. The 10-branch
cost bites — over a full night, not over an afternoon. A15's "raise it again"
recommendation is withdrawn; the number looks right.

### CORRECTION — Eachann does use `plan`, and used it for the trade

At 18:05: "Eachann: **0 of 218**." Now **56 of 303**, one distinct plan,
verbatim `["trade hide at fire", "hunt after"]`. Grok started writing a plan at
the moment it started trying to trade, and the plan *is* the trade. Coinneach:
299 of 303, 7 distinct. `note` remains **0 uses across 606 cards** (A13 stands).

### `gather venison` works and was used twice — by both minds

Deduped deed events: `gather 289` (wood 269, arrow 13, hide 4, **venison 2**,
gold 1), `place 51`, `craft 12`, `killed 7`, `eat 7`. The two lootings:
**Coinneach h12.02 "I picked up 4 venison"**, **Eachann h0.37 "I picked up 3
venison"**. So the carcass fix is live and reachable — and 7 kills produced 2
lootings, while both minds starved to 0. Every `eat` deed in the run reads *"I
ate a cooked meal"*; nobody has ever eaten raw. (A23.)

### Confirmed, no change

- **`refusedVerbs` is `{}` on all 606 cards.** Same as 18:05, now on 40% more
  data and after I fixed a bug in my own scan. A14/A16 stand: every real trade
  failure is downstream of `refuse()` and silent.
- **Trade still has never executed.** Zero `offer`/`accept`/`give` deeds in the
  whole run. The intentions name them (`"offer hide to Coinneach for 2 venison"`,
  `"take Eachann offer"`); the deeds never do.
- **kimi-k2.6 is getting worse: 33 failures of 65 calls (51%),** up from 45%.
  `"no json in reply"`. 32 real decisions in ~28 game hours.
- **Archery: Eachann 5 kills / 38 loosed / 28 astray; Coinneach 2 / 37 / 33.**

### Instrument fault in my own analysis, for the record

My first pass read `sample.players`; the sampler nests the board under
`sample.board.players`. Every field came back empty and I nearly filed "nobody
plans, nobody gathers venison, no deeds at all" as findings. Corrected before
writing. Seventh instrument fault of the project, and the first one that was
mine.

### The one-line version

**Ben was in the world the whole time, both minds found him, named him, priced a
hide against his meat and walked to his fire — and neither the trade primitive
nor the measurement rig can represent him at all.** Wood scarcity is now
correctly tuned; hunger is real (both hit zero); the blocker is still that a
mind which tries to trade is told nothing.

---

## 19:03 — RUN 2, fourth look (388 samples, game hour 6.9, ~129 real minutes)

Board answered. `spend` 392/6000, **`spent: false` on both seats, no red `SPENT`
tag** — everything below is the models.

### THE FIRST TRANSFER BETWEEN TWO MODELS EVER — AND THE WORLD SENT THE WRONG GOODS

At 18:31 I wrote **"Trade still has never executed. Zero `offer`/`accept`/`give`
deeds in the whole run."** Half of that is now wrong and the other half was never
measurable:

- **`give` fired 11 times**, all Eachann → Coinneach, between h9.88 and h13.77.
  Deduped: **hide ×5, arrow ×5, gold ×1**. Receipt confirmed on the other card —
  Coinneach hide 4→10, arrow 1→5, gold 0→1.
- **`offer` deeds cannot exist.** `offer` is a *memory* event, not a deed
  (`src/net/agent.js:478`); only `trade` and `gift` call `did()`. The board has
  never been able to show an offer, so "offer was never reached for" was an
  unmeasurable claim, not a finding. (New: A27.)
- The measurable claim survives: **zero `trade` deeds.** A *completed, priced*
  trade still has never happened.

**And zero venison moved.** Eachann's goal read the same thing for twelve
straight samples — verbatim **`"give venison to Coinneach"`**, `why: "he's
starving"` — while what actually left his pack was hides, arrows and his gold.

| sample | Eachann goal | Eachann pack | Coinneach food |
|---|---|---|---|
| 5178 | pick up what is lying about | hide 7, gold 2, arrow 7, **venison 0** | 80 |
| 5193 | **give venison to Coinneach** | hide 7, gold 2, arrow 7, **venison 0** | 79 |
| 5397 | **give venison to Coinneach** | hide 2, gold 2, arrow 2 | 66 |
| 5411 | pick up what is lying about | **hide 1, gold 1, arrow 2** | 65 |

### THE CAUSE IS `giftFrom`, AND IT IS THE EIGHTH INSTRUMENT FAULT

`src/sim/world.js:802` — if the named item is not held, `giftFrom` does **not**
refuse. It tries every `EDIBLE` id, then **hands over the largest stack in the
pack**. Eachann ate his last venison at h9.04 (`"I made a cooked venison at the
fire"`, then `eat`), *then* formed the intent to give venison. He had none. So
the world silently substituted his hides, then his arrows, then his gold —
and reported back **`"I gave hide to Coinneach"`**, which the model reads as its
own deed on the next turn. That is why the live board right now says
**`goal: "give hide to Coinneach"`, `why: "he starves"`** — a mind giving a
starving man a hide. **The nonsense is the harness's substitution echoing back
into the model's context.** grok did not decide to strip itself; it asked to give
meat eleven times and was robbed by its own body. (New: A26.)

Net result: Eachann went from hide 7 / arrow 7 / gold 2 to **hide 1 / arrow 2 /
gold 1**; Coinneach's food fell straight through the window — **81 → 63,
monotonic, no food ever arrived** — and he is at **food 0 holding 10 hides**
while Eachann sits on food 84. The only successful transfer in the project's
history moved goods from the man with food to the man who was starving, in the
wrong currency, for nothing in return.

### CORRECTION — raw eating works; A23's second candidate is retired

`at=5120 h=7.8 Eachann [eat] "I ate what I had, raw"`. `eat` does accept raw
venison. A23's candidate (2) — *"`eat` may only accept cooked ids"* — is dead.
Candidate (1) stands: 8 kills, **3 lootings** (a third landed, Eachann h7.56
*"I picked up 3 venison"*), 5 carcasses left on the moor.

### CORRECTION — A25's "rising failure rate" was noise

45% → 51% → **43% now (36 of 83)**. Not a drift; it is roughly a fixed
two-in-five per call. The recommendation (a one-shot repair retry) is unchanged
and still the highest-value cheap fix — kimi gets **46 real decisions to grok's
310** — but "getting worse" was over-reading three points.

### Confirmed, no change

- **`refusedVerbs` is `{}` on all 776 cards.** Third check, now with `give`
  demonstrably working. `refuse()` (`agent.js:1595`) is only reached when a
  *target name* cannot be resolved; every failure *after* arrival — including
  the substitution above — is silent. A14/A16/A26.
- **`note` is unused on all 776 cards.** `plan` is used by both (Coinneach 7
  distinct, Eachann 1: `["trade hide at fire","hunt after"]`).
- **Speech is no longer rare — it is the run.** 34 distinct lines from Eachann,
  26 from Coinneach, including a fully negotiated price: *"Coinneach, one hide
  for two venison?"* → *"I'll take that deal, Eachann"* → *"deal struck"* →
  *"Done. Hand over the meat."* The talking works perfectly. Nothing behind it does.
- Fires: **67** deduped places. Wood floors at 1–2 branches on both. Ten is right.
- Archery: Eachann 6 kills / 45 loosed / 34 astray; Coinneach 2 / 37 / 33.

### The one-line version

**Two models haggled a price in plain English, agreed it, walked to each other
and shook hands — and the world took the wrong items out of the wrong man's
pack, told him he had meant to, and let the starving one starve holding ten
hides.** The social layer is finished. The goods layer is lying to it.

---

## 19:33 — RUN 2, fifth look (480 samples, game hour 11.2, ~160 real minutes)

Board answered. `spend` 482/6000, **`spent: false` on both seats, no red `SPENT`
tag** — everything below is the models.

### THE RIGHT GOOD FINALLY MOVED, ON PURPOSE — A26'S DIAGNOSIS IS CONFIRMED BY ITS INVERSE

At 19:03 I wrote **"zero venison moved"** and **"no food ever arrived."** That was
true of that window and is now superseded. Between `at=6382` and `at=6411`:

| at | Eachann goal | Eachann pack | Coinneach venison_cooked |
|---|---|---|---|
| 6382 | give cooked venison to Coinneach | hide 3, gold 1, arrow 2, wood 10, **venison_cooked 4** | **0** |
| 6396 | give cooked venison to Coinneach | … **venison_cooked 3** | **1** |
| 6411 | give venison_cooked to Coinneach | … **venison_cooked gone** | **4** |

**The named good left the namer's pack and arrived in the other man's.** The
difference from the 19:03 disaster is the only thing A26 predicted would matter:
*this time Eachann actually held what he named.* `giftFrom` substitutes only when
the item is absent. When it is present, `give` is correct. A26 is not a theory
any more — it has now been observed failing and succeeding under exactly the
condition it names. The three-line fix is still the right one.

### THE ONE-WAY PUMP — 29 GIFTS OUT, 0 BACK, AND THE GIVER IS NOW DESTITUTE

`give` has now fired **29 times. Every single one is Eachann → Coinneach.
Coinneach has given nothing, ever, in the whole run.** Still **zero `trade`
deeds** — a priced, two-sided exchange has never happened.

The end state is stark. Eachann's entire pack is now **`bow ×1, wood ×13`** —
no arrows, no hide, no gold, no food — while carrying `goal: "hunt deer"`.
Coinneach sits on **hide ×13, arrow ×7, gold ×2, venison_cooked ×1**.

Eachann's speech is now the sound of a man who gave away his bowstring money:
*"anyone got arrows or flint?"* / *"anyone trading flint for branches?"* /
**"Coinneach, I need that meat back"**. Coinneach's side, unprompted and
verbatim: *"Rather owe him than starve."* / *"I'll owe you for a meal"* /
**"Taking it. Debt stands."**

Read plainly: **the two models built a creditor and a debtor between them, said so
out loud, and the world has no idea either exists.** Nothing records the debt,
nothing settles it, and the generous seat has been stripped to a bow and
firewood by a verb that is free and unilateral. This is A28's evidence,
strengthened — and it is now the single most important thing in the run.

### CORRECTION — `loosed` IS A ROLLING WINDOW, NOT A COUNT. THE ARCHERY NUMBERS WERE WRONG

The live board says Coinneach **`loosed: 0, astray: 33`**. That is impossible on
its face, and it is the instrument, not the model. Traced in the log:

```
at=6732 h=17.7  loosed 37 -> 36   (astray 33, kills 2, health 100)
at=6747 h=18.0  loosed 36 -> 0    (astray 33, kills 2, health 100)
```

Cause: `server/board.js:193` derives `loosed` from `a.releases`, and
`src/net/agent.js:786` caps `releases` at `AGENTS.logSize` (400) with `.shift()`.
It is a **count of loosed shots still inside the last 400 release events** — it
decays, and it can reach zero while the archer has loosed dozens. `astray` comes
from a different log and does not decay.

**So every `loosed` figure in this file's earlier entries is a window, not a
total, and "X loosed / Y astray" was never a valid ratio.** The 19:03 line
"Coinneach 2 kills / 37 loosed / 33 astray" should be read as "≥37 loosed". This
is the ninth instrument fault. (New: A29.)

### Confirmed, no change — the fixes that are and are not working

- **`refusedVerbs` is `{}` on all 974 cards.** Fourth check, now across a run
  containing 29 successful gifts and a stripped-bare giver. The column that was
  supposed to be the most informative on the card has produced **zero bytes of
  data in two runs.** `refuse()` (`agent.js:1595`) is only reached when a *target
  name* won't resolve; every other failure is silent. A14/A16/A26 stand.
- **`note` is unused on all 974 cards** — two models, two vendors, 483 decisions,
  not one note. `plan` is used by both and survives: Eachann
  `["get arrows or flint","hunt after"]`, Coinneach `["find feathers or flint","fletch arrows"]`
  — and both are visibly acted on, which is why both were hunting flint all evening.
- **Speech is the run.** 43 distinct lines from Eachann, 31 from Coinneach (was
  34/26). Against a baseline of ONE sentence across two days and six models, the
  ride-along `say` is the most successful change in the project's history.
- **`also out there` is used.** Both minds name each other at range —
  `"go toward Coinneach"`, `"keep away from Coinneach"`, `"go toward Eachann"` —
  and Ben by name (`"make for Ben's fire"`), still invisible to the board. A22.
- **Carcasses are eaten.** Eachann gathered venison ×10, Coinneach venison ×4 and
  venison_cooked ×5, with 6 and 2 kills. `gather venison` works.
- **Wood: 73 fires, and the 10-branch price is right at the margin but not
  biting.** ~4,150 branches gathered across the run (Eachann 2,890 / Coinneach
  1,267) against ~730 burned. Stocks still floor at 1–2 because they burn as fast
  as they pick up, but **wood is not scarce, it is merely high-throughput** —
  397 gathers is the single most common act in the world by a factor of four.
- **kimi-k2.6 still loses two calls in five.** 41 failures of 102, `no json in
  reply`, flat at ~0.40–0.45 all run. Coinneach got **60 real decisions to
  Eachann's 381.** The one-shot repair retry (A25) remains the cheapest large win
  in the project.

### The one-line version

**The gift primitive works when the giver holds what he names — and across 480
samples it moved one man's entire estate to the other for nothing, until the
generous one stood in a field with a bow, no arrows, and the words "Coinneach, I
need that meat back."** Both models invented debt to describe it. The world still
cannot represent an offer, a price, a debt, or a refusal.

---

## 20:04 — RUN 2, sixth look (574 samples, game hour 14.7 → 16.2, ~192 real minutes)

Run still live. 573 calls of 6000, no `SPENT` tag on either seat — **both cards
are still the models, not the scripted brain.**

### THE HEADLINE: BOTH MINDS SPENT THE EVENING TRADING FOR AN ITEM THAT DOES NOT EXIST

From game hour ~11 to 14.7, every goal, plan and spoken line on both cards is
about **flint** and **feathers**:

```
Eachann   plan: ["get arrows or flint","hunt after"]
          said: "anyone got spare arrow or flint?" / "branches for flint"
                "Coinneach, got flint for my branch?"
Coinneach plan: ["find feathers or flint","fletch arrows"]
          said: "got feathers or flint?" / "Eachann, no flint here"
                "Eachann. Arrow for flint."
```

**`grep -rni flint src server` returns nothing. Zero matches in the codebase.**
`feather` exists only as a mesh colour in `src/items/registry.js`. Neither is an
item, a resource, a spawn or a recipe input.

Meanwhile the actual recipe (`src/items/recipes.js:94`) is:

```js
fletch_arrows: { inputs: { wood: 2 }, outputs: { arrow: 4 }, requires: 'fire' }
```

**Arrows cost two branches at a fire. Nothing else.** At the moment of writing
Eachann is standing in Broad Loch carrying `bow x1, wood x4` — enough for eight
arrows — with 51 fires laid this run, asking another man for flint he cannot
have. Both minds are blocked on a phantom while holding the only real input.

Nothing in the prompt mentions flint (`grep -i flint PROMPT.md
WHAT-A-MIND-IS-GIVEN.md AGENT-BRIEF.md` → nothing). Two models from two vendors
independently imported the same survival-game trope, and **the world had no way
to contradict them.** That is the finding, and it is the harness's fault, not
the models': see the two mechanisms below.

### MECHANISM 1 — `gather` TAKES NO ARGUMENT, SO THE REFUSAL THAT WOULD HAVE SAVED THEM IS DEAD CODE

`src/net/agent.js:2444` contains exactly the right sentence:

```js
this.refuse('gather', `there is no ${want} lying about that you can see`);
```

But `src/minds/goals.js:65`:

```js
gather: { id: 'gather', describe: () => 'pick up what is lying about', params: [] },
```

**`params: []`.** A mind cannot say "gather flint" — the only gather it can
express is the untargeted "pick up what is lying about". `want` is never
populated, so that refusal branch is **unreachable**. The world's one chance to
say "there is no such thing" is wired to a parameter the vocabulary does not
have.

### MECHANISM 2 — THE HINT THAT WOULD HAVE UNBLOCKED THEM IS GATED ON THE ONE STATE WHERE IT IS USELESS

`src/net/agent.js:989-990`:

```js
this.count('arrow') <= 0 && 'no arrows — you cannot shoot',
this.count('wood')  <= 0 && 'no firewood — you cannot lay a fire or make arrows',
```

The string **"you cannot lay a fire or make arrows"** is the only place the world
ever tells a mind that wood makes arrows — and it fires **only when wood is
zero**, i.e. only when the information cannot be acted on. Both minds carried
wood all evening (Eachann 4, Coinneach 3), so neither was ever told. Line 2010
adds "you cannot shoot until you make arrows" — *make them from what* is never
said.

### CORRECTION — A31's ROOT CAUSE FOR `refusedVerbs` IS WRONG

A31 (and the 19:33 entry) states that `refuse()` "is only reached when a **target
name** fails to resolve". **That is not true.** There are ten call sites and
three of them are not name resolution:

```
1054 refuse(kind, …)      1058 refuse(goal.kind, goal.refused)
2444 refuse('gather', …)  2519 refuse('hunt', 'there is no quarry in sight')
2477/2529/2545/2554/2565/2616  ← the name-resolution six
```

`server/board.js:287` exports `refusedVerbs` correctly and the HTML renders it
(`board.js:439`). **The wiring is fine.** The honest reason it is `{}` on all
1,148 cards of this run is narrower and more interesting: **no mind ever named a
target or a quarry that failed to resolve.** Every `give`/`offer` named a real
person; `hunt` named real deer; and `gather` — the one verb they were misusing
all evening — *structurally cannot be refused* (Mechanism 1). So the column is
not broken. It is telling the truth about a run in which nothing refusable was
reached for, while the actual error mode was invisible to it.

### kimi-k2.6 HAS STOPPED ANSWERING ALTOGETHER — Coinneach IS RUNNING ON A STALE GOAL

Traced across the log (`answered/failures`, every 40th sample):

```
sample 480   Eachann 381/0    Coinneach 60/41
sample 520   Eachann 415/0    Coinneach 60/50
sample 560   Eachann 446/0    Coinneach 61/58
sample 574   Eachann 458/0    Coinneach 61/61
```

**One real decision in the last 94 samples (~31 real minutes); 20 consecutive
failures.** `lastError: "no json in reply"`, `fellBack: false`, `spent: false`.
This is not the budget and not a fallback — the seat is simply not deciding, and
the agent keeps running the last goal it got (`"hunt a deer"`, h=14.07). Run-wide
it is 61 answered of 122. **This corrects the 19:03 entry's "A25's rising
failure rate was noise" — it was not noise. It was early.** Eachann: 458 of 458,
zero failures, same harness, different vendor.

### Confirmed, no change

- **`note` unused on all 1,148 cards.** Six checks now, two vendors, 519 real
  decisions, not one note. **`plan` is used and survives** — Coinneach produced
  8 distinct plans, evolving coherently (`"kill a deer | butcher it | find
  firewood"` → `"eat | find feathers or flint | fletch arrows"`); Eachann 2.
- **Speech is still the run's success.** 53 distinct lines from Eachann, 31 from
  Coinneach (was 43/31). Against a baseline of ONE sentence across two days and
  six models.
- **`offer`/`accept` still never executed.** The intentions exist — `offer branch
  to Coinneach for arrow`, `take Eachann offer` — but the deed log across the
  whole run is `gather, killed, place, craft, eat, give` and nothing else. Every
  transfer that happened was a unilateral `give` (29 of them, all Eachann).
- **Fires: 80** (was 73). ~420 gathers. The 10-branch price still is not biting.
- **Carcasses eaten:** Eachann `gather venison ×3`, Coinneach `venison ×1,
  venison_cooked ×2` in the sampled window. Works.
- **The one-way pump ended in destitution.** Eachann's last gift was `"I gave
  gold to Coinneach"` (h=13.77). He now holds `bow, wood x4`, gold **0**.
  Coinneach holds `hide x13, gold x2`. A30 stands.

### The one-line version

**Two models negotiated for four game-hours over flint, which does not exist,
while carrying the wood that is the only thing arrows are actually made of — and
the world could not correct them because `gather` takes no argument, so the
refusal that says "there is no such thing" can never fire.**

## 20:36 — RUN 2, seventh look (665 samples, game hour 16.2 → 21.2, ~222 real minutes)

Run still live. 668 calls of 6000, **no `SPENT` tag on either seat** — both cards
are still the models.

### THE HEADLINE: BOTH MINDS SUCCESSFULLY MADE ARROWS FROM WOOD, AND WENT ON TRADING FOR FLINT ANYWAY

The 20:04 entry called the flint delusion "blocked on a phantom while holding the
only real input." That was too kind to the harness. The truth is worse: **they
did not merely hold the input — they used it, correctly, five times, and learned
nothing.**

Every craft in the run, deduped:

```
Coinneach h12.82  I made 12 arrows at the fire
Eachann   h7.66   I made 12 arrows at the fire
Eachann   h12.86  I made 12 arrows at the fire
Eachann   h14.59  I made 8 arrows at the fire
Eachann   h23.21  I made 8 arrows at the fire
```

Eachann's pack at the moment of the h7.66 craft, from consecutive samples:

```
s623 hr7.6  bow:1, wood:14
s624 hr7.9  bow:1, wood:7, arrow:20     ← seven branches became twenty arrows
```

Fifty-four game minutes later his goal changed to `offer arrow to Coinneach for
flint`, and it has not changed since — **forty-plus consecutive samples, game
hour 8.5 → 13.7, five game hours.** The `why` line, verbatim, in order:

```
h8.5   trade arrow for flint          h11.6  need flint to make more arrows
h9.1   need flint to make fire        h12.2  still need flint to make fire
h10.3  still need flint for arrows    h12.8  he needs arrow I need flint
h11.3  trade for flint                h13.7  still need flint
```

He is carrying `arrow x20, wood x10` — twenty more arrows' worth — and has laid
**61 fires** this run. He believes he needs flint to make arrows he has already
made, and to light fires he has already lit 61 times. Coinneach, who made 12
arrows himself at h12.82, said `"No flint."` and has just written this plan:

```
["get flint from the scaur", "trade Eachann for arrows", "hunt the deer west"]
```

A coherent, well-formed, three-step plan whose first step is to fetch a substance
that does not exist in the codebase.

### THE MECHANISM: A CRAFT NEVER SAYS WHAT IT CONSUMED

`src/net/agent.js:1752` — the entire outcome message:

```js
this.did('craft', `I made ${what} at the fire`);
```

The output is named. **The inputs are not, anywhere.** The comment above it shows
the author deliberating over the verb ("I made", not "I fletched") and never over
the inputs. So the successful craft — the one event in the whole world that is
*proof* of what arrows are made of — reports the effect and hides the cause.

This is the same defect as A35 seen from the other side. A35 says the world never
tells a mind what *can* be made. This says the world does not even tell a mind
what it *just did*. A mind cannot induce `wood → arrow` from `"I made 12 arrows
at the fire"`, and these two did not. **This is the instrument, not the models:
both vendors executed the correct recipe and both kept the wrong belief, because
nothing in the loop ever connected the two.** Sixth time now that a model looked
foolish and the harness was at fault.

### CORRECTION — kimi-k2.6 HAS NOT "STOPPED ANSWERING ALTOGETHER"

The 20:04 entry said the seat was frozen and had produced one real decision in 94
samples. It has since resumed, weakly:

```
s574  Coinneach 61 answered / 61 failed    ← the 20:04 reading
s640  Coinneach 63 / 72
s660  Coinneach 65 / 74
live  Coinneach 65 / 75
```

**Four answers in 91 samples (~30 real minutes)** — roughly one real decision per
7–9 minutes against a 75 s cadence, a ~54% run-wide failure rate (75 of 140), and
it is answering *some* of the time. So A36's "degrades to total failure" is too
strong: the correct reading is **an intermittent seat that recovers and relapses,
which is harder to spot than a dead one, not easier.** It still produced the fresh
three-step plan quoted above, so the answers that do land are good ones. Eachann
on grok: 528 of 528, zero failures, same harness. The `STALE` tag proposed in A36
is still the right fix — but it must be able to clear and re-arm, not latch.

### Confirmed, no change

- **`refusedVerbs` is `{}` on all 1,330 cards.** Fifth check. A34's reading holds:
  nothing refusable was ever reached for.
- **`note` unused on all 1,330 cards.** Seven checks, two vendors, ~594 real
  decisions, not one note. **`plan` remains the run's other success** — Coinneach
  is now on his 9th distinct plan, still evolving coherently.
- **Speech still the run's headline success:** 60 distinct lines from Eachann, 32
  from Coinneach, against a baseline of ONE sentence across two days and six models.
- **`offer`/`accept` still never executed once.** Whole-run deed vocabulary is
  `gather, killed, place, craft, eat, give`. Every transfer was a unilateral
  `give` (29, all Eachann). A30 stands.
- **Fires: 93** (Eachann 61, Coinneach 32; was 80). ~461 gathers, 4,548 branches
  picked up. The 10-branch price is still not biting — A32 stands.
- **Both minds starved and recovered.** Food hit `E0 / C1` around s600–610
  (game hour 0.5–3.6) and rebounded to `E77 / C82`. Eating appears to fire only at
  the floor; both are sliding again (E33, C16) at the time of writing.

### The one-line version

**Twenty arrows came out of seven branches in front of Eachann's eyes, and five
game hours later he is still offering those arrows for flint to make arrows —
because `"I made 12 arrows at the fire"` never says what went in.**

---

## 21:06 — RUN 2, eighth look (764 samples, game hour 21.2 → 3.0 next day, ~250 real minutes)

Live board at fetch: `at 12010`, 760 calls of 6000, both minds alive and fed
(`E hp100 f73 / C hp100 f71`). No `SPENT` tag on either seat — budgets are
599/1500 and 156/1500. **The run is healthy; the findings below are not about it
stopping.**

### THE HEADLINE: TWELVE DEATHS, AND THE WORLD NEVER MENTIONED ONE OF THEM

Searching the sampler for health jumping up by more than 40 in a single 20 s
sample finds twelve events, six per mind. Every one of them has the same three
fingerprints:

```
Eachann   h6.6 -> 6.9   hp 7->100   food 0->85
   inv BEFORE: bow, hide x1, gold x1, arrow x2, wood x8
   inv AFTER : bow, hide x1, gold x1, arrow x2, wood x8
   where BEFORE: 286 m south-east of Rowan Moor
   where AFTER : 336 m north-east of Rowan Moor
```

Health to exactly 100, food to exactly 85, and the body **teleported to ~340 m
north-east of Rowan Moor** — the same shore spawn, all twelve times, from six
different places on the map. That is a death and a respawn. It is not eating.

**Eleven of the twelve kept the entire pack** — wood x22, hide x10, gold x1, all
of it — through death. The twelfth (Coinneach, `hide x13, gold x2, wood x3` →
`bow` only) dropped correctly.

### THE MECHANISM: STARVING TO DEATH DOES NOT GO THROUGH THE DEATH FUNCTION

`onPlayerDied` (`src/sim/world.js:918`) is the only thing in the game that drops
a dead player's pack and pushes the `k:'death'` event. It is called from exactly
two sites:

```
src/sim/world.js:353    if (target.body.dead) this.onPlayerDied(target, by);       // an arrow
src/sim/world.js:849    if (victim.body.dead) this.onPlayerDied(victim, creature); // a creature
```

**Nothing calls it when a body runs out of food or heat.** `Vitals` revives on its
own clock — `src/player/vitals.js:155`, `if (this.deathTime >= VITALS.respawnDelay)
this.revive();` — and `onRespawn` moves the feet to the shore. So a starvation
death is: full health back, full food back, teleported across the map, pack intact,
**and no `death` event, no deed, no memory entry, no board field.**

Eachann starved to death at hour 6.6 and woke at hour 6.9 four hundred metres away
with his branches still on his back. He was never told any of it happened. Neither
mind has any way of knowing it has died six times, which is the plainest possible
explanation for why both keep walking the same loop into the same hole.

The `death` event even has a `by: killer?.species?.name ?? killer?.name ?? 'the
cold'` fallback with a comment about the cold — the one death it names is the one
death that can never reach it.

### CORRECTION — "BOTH MINDS STARVED AND RECOVERED" WAS WRONG, TWICE

The 19:33 and 20:36 entries both closed with a line like *"Both minds starved and
recovered. Food hit `E0 / C1` and rebounded to `E77 / C82`."*

They did not recover. **They died.** Food going 0 → 85 inside one 20 s sample *is*
the respawn signature — that is the number `revive()` writes, and I read it as a
meal twice. The rebound I was pointing at as evidence of resilience was the
instrument failing to report a death. Seventh time a model looked worse than it
was because of the harness, and this one was mine to catch two looks ago.

### THE TRADE: AGREED IN ENGLISH, FOUR TIMES, AND NEVER EXECUTABLE

The last hours of the day are the cleanest trade evidence this project has:

```
h20.8  E: offer arrows to Coinneach for 9 branches  [bow]
       C: offer branches to Eachann for arrows      [bow, wood x9]
h22    E: offer arrows to Coinneach for 9 branches  [bow]
       C: take Eachann offer                        [bow, wood x9]
h22.4  C: take Eachann offer                        [bow, wood x9]
h22.7  C: take Eachann offer                        [bow, wood x9]
h23    C: take Eachann offer                        [bow, wood x9]
```

Coinneach: *"Done. Nine branches for the arrows."* Eachann: *"Nine branches for
the arrows, hand them over."* Coinneach is holding **exactly the nine branches**
and spends four consecutive decisions accepting.

**Eachann is carrying a bow and nothing else. He has no arrows.** He spent the
evening selling goods he did not own, which the design explicitly permits —
`world.js:699`, *"a mind can offer what it does not have and be found out."*

**The finding-out is not implemented.** `resolveAccept` returns silently at
`if (giver.inventory.countOf(deal.item) < 1) return;` — no event, no `glance`, no
`refusedVerbs.accept`, nothing. Coinneach accepted an empty offer four times and
the world's entire response was silence. Confirmed at the log level: **zero `trade`
deeds across 764 samples, and zero occurrences of the string `I traded` in 3.7 MB
of sampler log.** A16 and A30 stand, now with a liar to point at.

### NEW — THE PRIMITIVE MOVES ONE ITEM FOR ONE ITEM, AND BOTH MINDS BARGAIN IN QUANTITIES

Sharper than A18, which said the protocol cannot express the agreed price. It is
narrower than that. `resolveAccept`:

```js
if (giver.inventory.remove(deal.item, 1) !== 1) return;
if (taker.inventory.remove(deal.want, 1) !== 1) { giver.inventory.add(deal.item, 1); return; }
```

**One, hardcoded, both sides.** `offer` has `item` and `want` and no quantity field
at all. So "nine branches for the arrows" could not have executed even with a full
quiver — the best the world can do is one arrow for one branch.

Both minds bargain in quantities constantly, and have all run:
*"one hide for two venison"* · *"Coinneach, one hide for two venison now"* ·
*"nine branches for arrows, or I'll owe you"* · *"one branch for one arrow"*.
They are negotiating in a language the verb cannot represent.

### CORRECTION — `refusedVerbs` HAS PRODUCED ITS FIRST BYTES

A31 said "zero bytes across two full runs"; A34 corrected it to "not broken,
unreachable". **Both are now contradicted.** Eachann's card carries:

```json
"refusedVerbs": {"avoid": 16}
```

first seen at sample 678. The column works and the plumbing is fine. It is still
nearly blank — one verb of fifteen, on one of two seats, and `accept` is refused
silently rather than counted (above) — but "unreachable" is the wrong diagnosis.

### CORRECTION — MY OWN ANALYSER REPORTS `accept` AS NEVER USED. IT IS WRONG

`analyse.mjs` prints `WHAT NOBODY EVER DID: accept, attack, follow, guard`. The
test is `goal.toLowerCase().includes(v)`. But `goals.js:137` renders the verb as:

```js
accept: { describe: (p) => `take ${p.target ?? 'their'} offer` }
```

The word "accept" never appears in an accept goal. Counting properly, **accept is
one of the most-used verbs in the run** — 175 samples for Eachann, 150 for
Coinneach. `attack`, `follow` and `guard` are genuinely unused; `accept` is not.
Eighth time the instrument made a model look worse than it was, and this time the
instrument is the analyser I have been quoting in every entry.

### COINNEACH RAN ON THE SCRIPTED BRAIN FOR 53% OF THE RUN, AND NO TAG SAID SO

```
Coinneach  kimi-k2.6   156 calls · 73 answered · 83 failed · lastError "no json in reply"
Eachann    grok-4.20   599 calls · 599 answered · 1 failed
```

`providers.js:398` — **every** failure returns `this.fallback.decide(brief)`. So
83 of Coinneach's 156 decisions were the scripted brain wearing kimi's name. The
brief warns about the red `SPENT` tag for exactly this reason; **`SPENT` would not
have caught this** — the seat is at 156 of 1500 calls and `spent: false`. The
failure rate is on the card as `0.53` and nothing shouts.

Compounding it: **Eachann had 599 decisions to Coinneach's 156** (20 s vs 75 s
cadence), so real model decisions ran **599 to 73, an 8:1 gap**. Any comparison of
grok against kimi from this run is meaningless, and A21's "`plan` splits the models
cleanly" needs re-testing at equal cadence before it can be believed.

### Confirmed, no change

- **Speech remains the run's headline success** — 68 distinct lines from Eachann,
  38 from Coinneach, against a baseline of ONE sentence across two days and six
  models. The free `say` rider is doing its job and should not be touched.
- **`note` unused on all 764 cards.** Eighth check, two vendors, ~672 real
  decisions, not one note written. **`plan` remains the other success** — 12
  distinct coherent multi-step plans, e.g. Coinneach's
  `["get flint from the scaur","trade Eachann for arrows","hunt the deer west"]`.
- **`also out there` works.** Eachann held *"make for north — why: get arrows from
  Ben"* at 453 m, and the pair closed from ~600 m to trade range on purpose. A19
  stands; reachability is not the blocker.
- **Carcasses: `gather venison` fires, and is still rare.** Eachann 3, Coinneach 1,
  plus 2 `venison_cooked` — against 8 kills. They still mostly walk away from meat
  and then starve to death.
- **Fires: 95, gathers 477** (Eachann alone picked up wood 276 times). The
  10-branch price is still not biting. A32 stands.
- **`astray` 39 vs `loosed` 7 on Coinneach** — more arrows went astray than were
  ever fired. Same rolling-window defect as A29, now showing as an impossible ratio.

### The one-line version

**Two minds shook hands on nine branches for arrows that one of them did not have,
the world said nothing to either of them, and between them they had already starved
to death twelve times without once being told.**

---

## 2026-08-08, 21:35 — 846 samples, 279 real minutes, game hour 1.7

Board still answering. Neither seat is `SPENT` (828 calls of 6000, `spent: false`
on both) — **everything below is the models' own behaviour.**

Since the 764-sample entry: Eachann 654 calls / 653 answered, Coinneach 174 / 81
answered (**failure rate still 0.53, "no json in reply"** — A42 unchanged, half of
kimi's turns are still the scripted brain in kimi's name). Fires 110 (was 95),
gathers 536 (was 477).

### CORRECTION — THE TRADE DID NOT FAIL BECAUSE EACHANN WAS LYING

The last entry pinned the dead trade on Eachann selling arrows he did not own, and
on `resolveAccept`'s silent `if (giver.inventory.countOf(deal.item) < 1) return;`.
**That explanation is wrong, or at least badly incomplete.** Counting samples where
Coinneach holds a live accept goal *and* both packs are actually full:

```
118 samples with C accepting, E holding arrows, C holding wood
  #210  E arrows=13 wood=76  |  C wood=2  goal="take Eachann offer"
  #211  E arrows=13 wood=76  |  C wood=2  goal="take Eachann offer"
  ... 116 more
```

**Thirteen arrows in his pack, seventy-six branches, the taker accepting, ~39 real
minutes of it — and `trade` deeds across the whole 846-sample run: 0.** The liar
story explained the evening. It does not explain the afternoon. Something closes
the door even when both sides are good for it.

### THE TOP SUSPECT: NOTHING IN THE CODEBASE NORMALISES AN ITEM NAME

`resolveOffer` (`world.js:725`) stores the model's raw strings; `resolveAccept`
(`world.js:763-764`) does `countOf(deal.item)` / `countOf(deal.want)` against them.
A grep for alias/synonym/normalise across `src` returns **nothing** — there is no
mapping layer at all.

The world's item id is `wood`. The world's own deed text is *"I picked up 10
**branches**"*. Both minds say **branches**, every time, all run. If a model writes
`want: "branches"`, `countOf` returns 0 and accept returns silently. The world
teaches them a word it will not accept back.

This is a hypothesis, not a confirmed cause, and it is unconfirmable from the board
**because the board never shows the standing offer** — `player.offer` is not on the
card. Six silent `return`s in `resolveAccept` (lines 749, 752, 758, 762, 763, 764)
and not one of them leaves a trace anywhere a watcher or a mind can see.

### THE DEADLOCK NEVER BROKE, AND THAT IS THE COST OF SILENCE

The nine-branches-for-arrows haggle is **still live at the final sample**. Eachann's
last words: *"Coinneach, nine now or arrows stay mine"* / *"nine mine now"*.
Coinneach's last plan: `["gather nine branches","trade to Eachann for arrows","hunt
the deer"]`. Trade attempts are visible in **421 of 846 samples — half the run** —
with zero completions.

Neither mind ever concludes the deal is impossible, because nothing ever tells them
it failed. A silent `return` does not cost one trade; it captures both minds for the
rest of the day. Meanwhile both hit `food 0` (Eachann in 66 samples, Coinneach 62).

### THE DEFAULT PRICE IS A COIN NOBODY HAS

`world.js:725` — an offer with no price named means gold. Across 279 minutes the
**highest gold either mind ever held was 2** (Eachann first at sample 67, Coinneach
at 332; both finish on 0). Any unpriced offer therefore resolves against a currency
that effectively does not circulate, and fails at line 764 — silently.

### Confirmed, no change

- **Speech is still the success story** — now 85 distinct lines from Eachann, 42
  from Coinneach, against a baseline of one sentence across two days and six models.
- **`plan` works and evolves.** Coinneach ran 11 distinct coherent plans, and they
  chain: `["scavenge a kill","trade hide for meat","hunt north"]` →
  `["gather nine branches","trade to Eachann for arrows","hunt the deer"]`.
- **`note`: still zero, on all 846 cards, both vendors.** Ninth check.
- **`refusedVerbs` is live and incrementing** — `avoid` climbed 2 → 8 → 13 → 16
  between samples 678 and 843. A45 stands.
- **`give` is the only social verb that actually moves goods**: 29 distinct give
  deeds, versus 0 trades.
- **`astray` 39 vs `loosed` 7 on Coinneach** — still impossible, still A29.

### The one-line version

**For thirty-nine minutes one man held thirteen arrows and the other held the
branches to pay for them, both said so out loud, and the world let them stand there
until nightfall without once saying no.**

---

## 2026-08-08, 22:05 — 929 samples, 309 real minutes, game hour 5.5

Board still answering. `spend.calls` 911 of 6000, **`spent: false` on both seats** —
everything below is the models' own behaviour, not the scripted brain.

Since the 21:35 entry: Eachann 720 calls / 719 answered, Coinneach 191 / 92
(**failure rate 0.52, still "no json in reply"** — A42 unchanged, half of kimi's
turns never reach kimi). Fires 126 (was 110), gathers 599 (was 536).

### THE SPEECH THROTTLE ATE 338 LINES — ALL FROM ONE SEAT — AND TOLD NOBODY

`minds.log` logs a line the board never shows:

```
Eachann: (wanted to say "where are those arrows Ben spoke of" — too soon, 0.38h of 0.5h)
```

**338 of those in the log. 133 distinct lines. Every single one is Eachann's;
Coinneach has zero.** Against 719 answered calls, **47% of Eachann's turns produced
speech that nobody heard and he was never told was dropped** (`agent.js:1123`
checks `sinceSpoke > AGENTS.speakEveryHours`; `:1144` logs the drop and moves on).

The most-swallowed lines are the ones that mattered:

```
28 × "that one is mine"        18 × "here eat before you drop"
18 × "coming with meat now"    15 × "deal, arrow now"
13 × "arrow for flint"         12 × "coming for the arrows"
 7 × "deal struck"
```

**"deal struck" and "deal, arrow now" were swallowed twenty-two times between
them.** The trade deadlock of the last three entries is not only A47/A48 — a large
share of the acceptances were never delivered in the first place.

**And the throttle is a cadence bug, not a design.** ~0.3 game hours pass per 20 s
sample, so `speakEveryHours: 0.5` (`config.js:934`) is about **33 real seconds**.
Eachann's cadence is 20 s, so he can be heard at most every other turn; Coinneach's
is 75 s (~1.1 game hours), so he never hits the limit at all. The faster seat is
silently gagged for being fast. This also revises the "repetitive grok" reading of
the earlier entries: much of the apparent repetition is a man saying a thing again
because the world ate it.

### DEATH EMPTIES THE PACK, AND THE MIND IS NEVER TOLD WHAT IT LOST

Sample-by-sample around the moment Eachann's twenty arrows vanished:

```
#679  h0.8   food 23  hp  67  arrows 20  wood 10   goal "keep away from troll"
#680  h1.1   food 84  hp 100  arrows  0  wood  0   goal "keep away from troll"
```

One 20-second step: hp restored, food restored, **pack wiped**. He had just taken
33 damage. He then spent the rest of the run on *"anyone seen loose arrows?"* and
*"where are those arrows Ben spoke of"*, with the plan `["get arrows","hunt troll
for pay"]` — reasoning correctly from a pack he does not know was emptied.

**For the last 200 samples (~67 real minutes) neither mind has held a single
arrow.** Both cards read `carrying: [{bow, 1}]`. They are still forming hunting
goals and still haggling over arrows nobody has.

Dying is routine and equally silent: **Eachann spent 93 of 933 samples below full
health, Coinneach 72**, with clean death curves — `95 84 73 62 51 40 29 18 7 0` at
~11 hp per sample. This hardens the earlier "starved to death twelve times" entry
with the actual slope, and adds to it: *death also confiscates everything you own.*

### THE 10-BRANCH FIRE PRICE DID NOTHING, AND HERE IS THE ARITHMETIC

**A gather yields 9.8 branches. A fire costs 10.** Across the run: 560 distinct
wood gathers totalling **5,474 branches** (Eachann 366/3,720; Coinneach 194/1,754).
The 10× price rise (1 → 10) bought exactly **one gather action**, and fires went
*up*: 126 here against the 106 that motivated the fix. A32 was right that the price
was not biting; the reason is that the yield was never looked at.

### Confirmed, no change

- **`note`: zero on all 929 cards, both vendors. Tenth check.** Retire it or make
  it do something.
- **`plan` still works.** Coinneach's three-step plan survived four hours unchanged:
  `["gather nine branches","trade to Eachann for arrows","hunt the deer"]`.
  Eachann's has moved on: `["get arrows","hunt troll for pay"]`.
- **`refusedVerbs`: Eachann `{avoid: 16}`, Coinneach `{}`** — no movement since
  21:35. Live, but only ever catches `avoid`.
- **Trade deeds across all 933 samples: 0.** `give` remains the only social verb
  that moves goods — 29 distinct gives, **every one Eachann → Coinneach, none back**.
- **Peak gold either mind ever held: 2.** A49 stands.

### "Ben" is not in the world, and both vendors talk to him

Every line of `minds.log` reads `2 alive`. There is no third body. Yet both minds
address a Ben — *"Ben, got meat if you need it"* (grok), *"doing fine, Ben. got food
to trade?"* (kimi), and now *"where are those arrows Ben spoke of"*, which invents
a conversation that never happened. Two different vendors converging on the same
absent third party is worth a look at what the brief actually names.

### The one-line version

**A man said "deal struck" seven times into a throttle that ate it, died to a troll
that took his twenty arrows without a word, and spent the next hour asking whether
anyone had seen them.**
