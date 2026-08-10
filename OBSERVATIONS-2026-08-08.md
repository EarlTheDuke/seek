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

---

## 2026-08-08 22:40 — RUN 2, samples 934–1027 (board still live, `at 15859`)

Neither seat is `SPENT`: Eachann 786/1500, Coinneach 210/1500; wallet 995/6000.
Everything below is the model's behaviour, not the scripted brain.

### BOTH MINDS SPENT THE RUN HUNTING FOR "FLINT" AND "FEATHERS", WHICH DO NOT EXIST

This is the root cause of the arrow economy, and it undoes my own earlier reading
of it.

The recipe (`src/items/recipes.js:105`):

```js
fletch_arrows: { inputs: { wood: 2 }, outputs: { arrow: 4 }, requires: 'fire' }
```

**Two branches at a fire. That is the entire cost of four arrows.** A grep for
`flint` and `feather` across `src/`, `server/`, `PROMPT.md`,
`WHAT-A-MIND-IS-GIVEN.md` and `roster-duo.json` returns **two hits, both the English
word "feathered" in unrelated terrain comments**. Neither item exists. Nothing shown
to a mind ever mentions either.

Both models invented them anyway, from real-world archery priors, and then built the
whole failed economy on top:

- Coinneach's plan for **254 of 1027 samples**: `["find feathers or flint","fletch
  arrows"]`. For another **146**: `["get flint from the scaur","trade Eachann for
  arrows","hunt the deer west"]`.
- Eachann, out loud: *"anyone got flint?"* / *"anyone got flint or feathers?"* /
  *"anyone trading flint for branches?"* / *"got branches for your flint"* /
  *"arrow for flint"*.
- Coinneach, back: *"got feathers or flint?"* / *"Eachann, no flint here"* /
  *"No flint."*

**Correction to the 21:35 and 22:05 entries.** I read the nine-branches-for-arrows
haggle as a trade-mechanism failure and went looking for the bug in
`resolveAccept`. The silent `return`s are real and still worth fixing — but they are
not why these two never got arrows. They were negotiating for a good either could
have manufactured from **2 of the 9–14 branches already in his hand**, while
standing at his own fire. Coinneach proved he knows how: *"I made 12 arrows at the
fire"* at h12.82. Then he went back to looking for flint.

### THE ARROW DROUGHT BROKE — BY AUTARKY, NOT BY TRADE

Superseding the 22:05 entry's *"for the last 200 samples neither mind has held a
single arrow"*: that ended. Eachann crafted 8 arrows at h15.40 and 8 more at h18.54
and closes the window holding **18**.

He did it alone. **Trade deeds across all 1027 samples: 0.** The `did('trade', …)`
hook at `agent.js:485` works and would log one; it has never fired. Every good that
moved in this world moved by unilateral `give` — 29 of them, **every one Eachann →
Coinneach, none back**, confirmed by matched inventory steps (h13.70: Eachann
`arrow 5→2, hide 5→2`; Coinneach `arrow 2→5, hide 6→9`).

So the instrument is fine and the verb works. The bargain is what never closes.

### THE TWO SEATS HAVE COMPLETELY DIVERGED, AND ONE IS STARVING AT A FIRE

Final ten samples:

```
at15859   Eachann   arrow 18  food 59  hp 100      Coinneach   arrow 0  food 9  hp 100
```

Coinneach is losing ~1.2 food per sample and will hit 0 in roughly eight. Whole-run
totals, Eachann first: kills **8 / 2**, crafts **17 / 3**, eats **8 / 5**.

His last 29 deeds — the entire 94-sample window — are **gather branches, light
fire, gather branches, light fire**. Not one hunt. Not one meal. Not one craft. He
has 9 wood and a fire and is 2 branches from four arrows, and his stated plan is to
find flint.

**The confound, stated plainly:** Eachann got **785 answered decisions** to
Coinneach's **99** — a 20 s vs 75 s cadence multiplied by kimi's unchanged **53%
`"no json in reply"` failure rate** (110 of 210). That is ~8× the effective agency.
This run cannot separate *model quality* from *decisions per hour*; the divergence
is real but its cause is not isolated. A same-cadence, same-failure-rate pairing is
the only way to read it.

### Confirmed, no change

- **`note`: zero on all 1027 cards, both vendors. Eleventh check.** Retire it.
- **`plan` works and is the best field on the card** — 13 distinct plans from
  Coinneach, 3 from Eachann, all coherent, all acted on. It is also how we caught
  the flint delusion, because a mind writes its false premise down there.
- **`refusedVerbs`: Eachann `{avoid: 16}`, Coinneach `{}`** — unmoved across the
  whole run. It only ever catches `avoid`. `offer` and `accept` never appear in it
  despite ~25 trade-shaped intentions, because `resolveAccept`'s eight bare
  `return`s (`world.js:749–764`) call nothing, and `this.acted` — which *does* count
  offer/accept attempts at `agent.js:1288` — **is never published to the board**.
- **Speech remains the success story**: 101 distinct lines from Eachann, 44 from
  Coinneach. Both name each other constantly. `say` was the cheapest fix and is the
  one that changed the world most.
- **Fires: 142 sampled** (Eachann 93, Coinneach 49). A53 stands — the 10-branch
  price is one gather.
- **Peak gold either mind ever held: 2.** A49 stands.

### The one-line version

**Two models haggled all day over arrows they could each have made from two of the
branches in their hands, because both of them independently decided this world has
flint and feathers in it, and it has neither.**

---

## 2026-08-08 23:06 — RUN 2 still live, samples 1027→1124 (`at` 15859→17172)

Board answering. **No `SPENT` tag on either seat** — Eachann 851/1500, Coinneach
227/1500, session 1078 of 6000, `exhausted:false`. Everything below is the models.

### THE 22:40 PREDICTION WAS RIGHT, AND THE OUTCOME WAS THE OPPOSITE OF THE POINT

The last entry said Coinneach was "losing ~1.2 food per sample and will hit 0 in
roughly eight." He hit 0 at `at`15990 and bled out: hp **100 → 92 → 59 → 26 → 4**.
Then, at `at`16136, one 44-second step later:

```
before   h16.9  food 0   hp  4   213 m NE of Heather Thicket   bow:1, wood:10, arrow:12
after    h17.8  food 85  hp 100  342 m NE of Rowan Moor        bow:1, wood:10, arrow:12
```

He starved to death, woke across the map full-fed, and **kept the pack byte for
byte — including the twelve arrows he had spent the entire day begging Eachann
for.** He was never told any of it happened.

**Whole-run starvation census, all 1124 samples: 17 deaths — Eachann 8, Coinneach
9.** Sixteen of the seventeen kept the pack identically; the seventeenth gained a
branch. A39 called this at twelve-in-764; this closes the number.

**The two death rules are exact opposites and nobody chose that.** A52's death
(troll, `at`≈13600) confiscated 20 arrows and 10 wood, because a creature kill runs
`onPlayerDied` (`world.js:849`). Starving does not — `Vitals` revives itself and
nothing calls `onPlayerDied` at all. So being mauled costs you everything and
starving costs you nothing, and neither one is announced. For Coinneach today,
**starving was the cheapest way to get a meal**: hp and food restored, pack intact,
zero decisions spent. There is no hunger pressure in this world, which is the
simplest available answer to why nobody will pay for food.

### THE THIRD NEGOTIATION OPENED, AND IT HAS THE SAME SHAPE AS THE FIRST TWO

New in this window, verbatim:

> **Coinneach:** *"Eachann. Branches for food. What do you have?"*
> **Coinneach:** *"seventy-four branches. What food can you spare?"*
> **Eachann:** *"seventy-four branches? I'll give you some meat for fifty"*

Both cards carry `plan` lines that match — Coinneach *["find Eachann at dawn, trade
branches for food"]*, Eachann *["get arrows","hunt troll for pay"]* — and both are
standing in Heather Thicket. Three negotiations this run, every one priced in a
quantity the engine cannot express:

| | price named | engine |
|---|---|---|
| hide ↔ venison | *"one hide for **two** venison"* | 1-for-1 |
| branches ↔ arrows | *"**nine** branches for the arrows"* | 1-for-1 |
| branches ↔ meat | *"meat for **fifty**"* | 1-for-1 |

**Trade deeds across all 1124 samples: 0.** `did('trade', …)` (`agent.js:485`) works
and has never fired. A41/A50 predicted this twice; this is the third confirmation.

And this one could not close even with quantities, for a second reason: **Eachann
is selling meat he does not have.** He holds venison in 194 of 1124 samples (17%);
he last held any at `at`16063, and has advertised *"got meat"* continuously since.
That is the designed liar mechanic working — `resolveOffer` reserves nothing on
purpose — but `resolveAccept` then returns silently at
`giver.inventory.countOf(deal.item) < 1`, so the lie is never *found out*, which was
the whole point of not reserving.

### Confirmed, no change

- **`note`: zero on all 1124 cards, both vendors. Twelfth check.** Retire it.
- **`plan` remains the best field on the card** and survives: Coinneach's plan was
  written before the window and drove his goals at h8.36 (*"go toward Eachann /
  need to trade for food"*) and h10.06 (*"offer branches to Eachann for food"*).
- **`refusedVerbs` still `{avoid: 16}` / `{}`** — unmoved. It cannot see any of the
  above. A56 stands.
- **kimi-k2.6 `no json in reply`: 116 of 227 (51%)**, flat across the whole run, not
  a late degradation. A42/A57 stand.
- **Wood, closing numbers** (supersedes A53's): **769 gathers, 8,939 branches
  (11.6 each), 145 fires.** The 10-branch fire is still ~one gather.
- Verbs with zero completed deeds all run: **trade/accept, attack, follow, guard.**

### The one-line version

**A man starved to death for the ninth time, woke up fed and holding everything he
owned, and went straight back to bargaining for food — and the world has never once
told either of them that dying is free.**

---

## 2026-08-08 23:35 — RUN 2 still live, samples 1124→1202 (`at` 17172→18513)

Board answering. **No `SPENT` tag on either seat** — Eachann 925/1500, Coinneach
246/1500, session 1171 of 6000, `exhausted:false`. Everything below is the models.

### THE THIRD BARGAIN "CLOSED", AND WHAT CHANGED HANDS WAS BRANCHES BOTH MEN BELIEVE ARE MEAT

Both minds said the deal was done, in their own words:

> **Eachann:** *"Done. Meat for your fifty branches."* → *"Here's the meat."*
> **Coinneach:** *"Forty-eight. I owe you two branches."* → *"Done. I owe you two."*

Eachann's card, live, right now:

```
goal "give venison to Coinneach"   why "fulfil trade"
carrying   bow:1  arrow:19  hide:3  wood:69          <-- no venison. none.
deeds      h16.84 "I gave wood to Coinneach"
           h16.95 "I gave wood to Coinneach"
           h17.10 "I gave wood to Coinneach"
```

He is not lying this time. He asks the engine for `give venison`, and
`giftFrom` (`world.js:802–816`) walks named → edible → **largest stack**. He holds no
venison and nothing edible, so it hands over the top of his biggest pile: a branch.
`resolveGive` then logs the substitution honestly — *"I gave wood"* — and tells
**nobody**. The receiver gets no event naming what he actually got, and the giver's
own mouth keeps saying *"Here's the meat."*

The function's docstring says it is *"what to hand over when a mind did not say."*
It is also, unmarked, what happens when a mind **did** say and was wrong.

### AND THE MAN RECEIVING THE BRANCHES IS GATHERING BRANCHES TO PAY FOR THEM

Coinneach's card, the same instant:

```
goal "pick up what is lying about"   why "fifteen short of fifty for Eachann's meat"
carrying  bow:1  wood:43  arrow:7
```

Measured ledger, `at`18353 → `at`18513 — every matched step where one pack loses
exactly what the other gains:

```
at18353   Eachann -1 arrow  -> Coinneach +1
at18367   Eachann -1 wood -1 arrow -> Coinneach +1 +1
at18382   Eachann -3 wood   -> Coinneach +3
at18411   Eachann -2 wood   -> Coinneach +2
at18498   Eachann -2 wood   -> Coinneach +2
at18513   Eachann -6 wood   -> Coinneach +6
```

**Reverse transfers: zero.** Eachann's wood has gone **124 → 69** since the
handshake — he has paid out ~55 branches, almost exactly the fifty he was owed —
while Coinneach, receiving them, counts himself *"fifteen short of fifty"* and keeps
picking branches off the ground to settle the debt.

**Whole-run give deeds: 45. All 45 are Eachann's. Coinneach has never given anything
to anyone in 1,202 samples.** (Supersedes the 29 at sample 1027 and 30 at 1124.)

### WHY NO PRICE IN THIS WORLD CAN EVER BE PAID

`resolveGive(from, toName, itemId)` — **there is no quantity parameter.** The body
hardcodes `from.inventory.remove(id, 1)` / `to.inventory.add(id, 1)`
(`world.js:682–687`), and the intent is `{give, giveItem}` with no count field
anywhere in the protocol. `offer` and `accept` are the same (A50).

It is deliberate. `world.js:1149–1160` edge-detects `give` on the rising edge because
`givecheck` once held the field for eight packets and *"twelve arrows changed hands,
which is the entire stack and not what anybody asked for."* The stack transfer was
the bug; one-per-press was the fix.

So: **every price these two models have ever named is a quantity, and the engine has
no way to move a quantity.** Fifty branches is fifty separate decisions — at
Eachann's 20 s cadence, about seventeen game-hours of doing nothing else. The
`-6 wood` step above is six gives, not one.

| negotiation | price named | what the engine can move |
|---|---|---|
| hide ↔ venison | *"one hide for **two** venison"* | 1 |
| branches ↔ arrows | *"**nine** branches for the arrows"* | 1 |
| branches ↔ meat | *"meat for **fifty**"* | 1 |

### `refusedVerbs` — SOLVED, AND IT IS WIRED TO THE ONE PLACE REFUSALS DO NOT HAPPEN

Unmoved all run: Eachann `{avoid: 16}`, Coinneach `{}`. The cause is now exact.
`grep -o "this.refuse('...'"` over `agent.js` returns **seven call sites — one per
verb** (`avoid, give, offer, accept, attack, hunt, gather`), and every one of them is
the same pre-flight check: *"there is nobody called X"* / *"nothing called X"*.

Every **downstream** failure — out of range, you don't hold it, no matching offer —
is a silent `return` inside `world.js`. `avoid` is the only verb whose *sole* failure
mode is the name lookup. That is the entire reason it is the only verb that ever
appears in the column.

This is not a tuning problem and A56's `this.acted` patch is the right fix, but it
understated the scope: **`refusedVerbs` today cannot see any failure that happens
after the name resolves**, which is all of them.

### Confirmed, no change

- **Carcasses work — the fix landed.** `gather venison` fired 5 times: Eachann 3, 3,
  4, 2 at h0.37/h7.80/h9.68/h21.17, Coinneach 4 at h12.02, plus 12 cooks at fires.
  Meat is being eaten off kills. First live confirmation.
- **`plan` is the best field on the card.** Non-empty in **1198/1202** of Coinneach's
  samples (16 distinct) and **955/1202** of Eachann's (3 distinct), and it tracks the
  live goal — Coinneach's current *["gather to fifty","get meat from Eachann","hunt
  if he won't deal"]* is exactly what he is doing.
- **`note`: zero on all 1,202 cards, both vendors. Thirteenth check.** Retire it.
- **Starvation census, whole run: 20 deaths — Eachann 9, Coinneach 11.** Two new this
  window (`at`17814, `at`17959). **18 of 20 kept the pack byte for byte.** A58 stands;
  supersedes the 17 at sample 1124.
- **kimi-k2.6 `no json in reply`: 121 of 246 (49%)**, flat all run. A42/A57 stand.
- **Trade deeds (`k:'trade'`): still 0.** `accept` has never completed once. Verbs
  with zero completed deeds all run: **accept/trade, attack, follow, guard.**
- **Speech is still the success story** — 105 distinct lines from Eachann, 53 from
  Coinneach, both naming each other constantly.

### The one-line version

**Two men shook hands on fifty branches for a side of venison; the seller had no
venison, so the engine quietly handed over his branches one at a time while he said
"here's the meat" — and the buyer, taking delivery of his own currency, went off to
gather more of it to pay the bill.**

---

## 2026-08-09 00:05 PT — sample 1,294 (game h21.8, `at`19738) — RUN STILL LIVE

Board answered. **Neither seat carries a `SPENT` tag** — 1,249 calls of 6,000,
`exhausted: false`, both minds still their own. Window since the last entry:
**92 samples, ~30 real minutes, game h20.3 → h21.8.**

### THE PAYMENT DIRECTION HAS NOT REVERSED — IT HAS ACCELERATED

In those 92 samples Eachann made **26 give deeds. Coinneach made zero.**

```
new window   Eachann  -16 wood  -10 arrow   ->  Coinneach     (26 gives)
             Coinneach                       ->  Eachann      (0 gives)
```

That is **26 gives in 7% of the run**, against 35 in the whole 6.7 hours before it.
Whole-run total is now **61 give deeds, every one Eachann's** — wood 29, arrow 19,
hide 8, gold 2, venison_cooked 3. **Supersedes the 45 in the previous entry** (which
itself superseded 29/30). Coinneach has now given nothing to anyone across 1,294
samples. A62 and the give-direction finding stand and are sharper: the one-per-tick
edge-detector is not a slow trickle, it is a pump that speeds up the longer a
negotiation stays open.

**Eachann is now paying out the two goods he is negotiating to acquire.** His plan
reads `["get arrows","hunt troll for pay"]` and he gave away ten arrows in the same
window. His goal at the last sample:

```
Eachann   goal "offer meat to Coinneach for arrows"   why "need more than owed"
          carrying  bow:1  arrow:8  hide:3  wood:6
```

*"need more than owed"* — the creditor has stopped trying to collect the fifty
branches and opened a **second** deal, priced to cover the first. That is a
creditable piece of reasoning about a debt the engine made unpayable.

And the debt closed the only way it could. Coinneach's last words on it:

> **"Eachann, I have six. Not forty-eight."**

He is telling the truth — he holds `wood:6`. He gathered to seventy-four, promised
fifty, and burned the difference into fires (155 sampled this run: Eachann 97,
Coinneach 58). His plan is nonetheless **unchanged from the last entry** —
`["gather to fifty","get meat from Eachann","hunt if he won't deal"]` — while the man
he owes hands him branches.

### CORRECTION TO MY OWN READING: "no food" IS NOT HUNGER, AND THE MIND CANNOT TELL

Coinneach's last card: `why "he is near and I have no food"` — at **food 59**, health
100, not hungry by any measure the sim keeps. I was about to log this as a model
misreading its own state. It is the harness.

Two different facts are computed in the same file and only one reaches the mind as a
number:

```
agent.js:950-952   hunger: food<=0 'starving' | food<25 'hungry' | else 'fed'
agent.js:991       !EDIBLE.some((id) => this.count(id) > 0) && 'no food'
```

Line 991 fires on an **empty larder**, not an empty stomach. Coinneach carries
`bow, wood, arrow` — nothing edible — so he is handed the words *"no food"* while
line 950 simultaneously classes him **`fed`**. Every model that has read that string
has behaved as though it were starving, because in English it is. Sixth time now the
instrument has made a mind look incompetent (A29, A41, A50, A57, A61, this).

### Confirmed, no change

- **`refusedVerbs` still `{avoid: 16}` / `{}` at 1,294 samples.** A63's root cause
  (blind to every failure after the name resolves) needs no further evidence.
- **`accept`/`trade`: still zero completed deeds, whole run.** Both minds have set
  `take X offer` as a goal repeatedly; it has never once produced a deed.
- **`note`: zero on all 1,294 cards, both vendors. Fourteenth check.** Retire it.
- **`say` still the one unqualified success** — both minds naming each other and
  quoting prices in nearly every line.
- **kimi-k2.6 `no json in reply`: 126 of 263 (48%)**, flat all run. Half of
  Coinneach's turns remain the scripted brain wearing kimi's name. A42/A57 stand.
- Sampling caveat unchanged: `deeds` is a rolling window of 5 at a 20 s sample, so
  every count here is a **floor**.

### The one-line version

**The creditor gave up on collecting, opened a second deal priced to cover the first,
and went on paying the debtor twenty-six more times in half an hour — while the
debtor, holding six branches of the fifty he promised, walked toward him saying he
had no food, because the game says "no food" when it means "nothing in the pack."**

---

## 2026-08-09 00:34 PDT — sample 1,378, game hour 23.7 (run still live, NOT spent)

`accept` **never once resolved in the whole 24-hour day.** Deed kinds across 1,378
samples, deduped:

```
Eachann   gather 538  place 97  craft 17  eat 10  killed 9  give 58
Coinneach gather 294  place 56  craft  5  eat  5  killed 3  give  0
```

There is no `trade` row. Not one. Meanwhile both minds reached for the verb —
**35 offer/accept goals sampled** (Eachann 13 offer / 8 accept, Coinneach 7 / 7),
and the run *ends* mid-handshake with both cards agreeing:

```
Eachann    goal "offer meat to Coinneach for 6 arrows"  why "he keeps asking, close enough"  said "six or no deal"
Coinneach  goal "take Eachann offer"                    why "take the meat, six arrows"      said "Six arrows. Robbery, but fine."
```

Two minds, same price, both saying done, 306 m and 298 m south of Broad Loch —
**within trade range 254 of 557 comparable samples** — and the engine transferred
nothing. This is not a model failure. Both models negotiated a clean bargain in
English and both pressed the right button.

### THE NEW PART: `give` FORGIVES A BAD ITEM NAME AND `accept` DOES NOT

This is why the two verbs have opposite records with the same two models.

`resolveGive` routes through `giftFrom` (`world.js:802–810`), which is deliberately
forgiving — **named item → else anything edible → else best slot**. Something always
moves. Hence 58 gives.

`resolveAccept` (`world.js:763–764`) is exact-match-or-die:

```js
if (giver.inventory.countOf(deal.item) < 1) return;
if (taker.inventory.countOf(deal.want) < 1) return;
```

`deal.want` is the model's raw string. `sanitiseGoal` strips control characters and
caps at 40 chars (`goals.js:193`) — **it does not map words to item ids.** So the
final deal of the run asks `countOf("6 arrows")`, and the id is `arrow`. Zero. Silent
`return`. Every price either mind named this run — *"6 arrows"*, *"two venison"*,
*"nine branches"*, *"meat"*, *"flint"* — is a phrase, not an id. `meat` and `flint`
are not items in this world at all.

So A62 is right that quantity is missing, but it is the smaller half. **Even at
1-for-1 with a quantity field bolted on, this trade still fails, because the
*noun* never resolves either.** A62's fix as written would not have closed a single
bargain in this run.

**Correction to the previous entry's framing.** I had read the endless re-quoting
(*"Nine branches or no arrows still stands"* × 15) as stubbornness. It is not.
Neither mind is ever told the deal failed — see below — so from inside, repeating
the price is the *correct* move. Seventh time the instrument has made a mind look
worse than it is.

### Confirmed, unchanged

- **`refusedVerbs`: `{avoid: 16}` / `{}` at 1,378 samples.** A63 exactly: all seven
  `refuse()` sites are the pre-flight name lookup, and every one of `resolveAccept`'s
  seven silent `return`s is downstream of it. The single most informative column on
  the card is structurally blind to the single most important failure in the game.
- **`note`: empty on every card, both vendors, fifteenth check.** Retire it.
- **`plan`: alive and genuinely used** — 4 distinct for Eachann, 17 for Coinneach,
  and they track the negotiation (`["gather nine branches","trade to Eachann for
  arrows","hunt the deer"]` → `["gather to fifty","get meat from Eachann","hunt if
  he won't deal"]`). Plans survive and steer. Keep `plan`, drop `note`.
- **`say`: still the unqualified win.** ~190 distinct lines, both minds naming each
  other and quoting prices. The one-sentence-in-two-days era is over.
- **kimi-k2.6 `no json in reply`: 127 of 279 (46%).** Flat all run. Half of
  Coinneach's turns are the scripted brain wearing kimi's name.
- **Fires: 153 sampled (Eachann 97, Coinneach 56) — the 10-branch price did not
  bite.** Peak wood carried was **154 (Eachann) / 88 (Coinneach)**; Eachann ends
  holding 36. Wood is not scarce, it is a currency they had too much of. A53/A60
  stand; raising the price again is the wrong lever.
- Gives: 58 by my dedup key vs A67's 61 — different keys over the same rolling
  5-deep window at a 20 s sample. Both are floors; no contradiction.

### The one-line version

**Both models closed the same bargain out loud — "six or no deal" / "Six arrows.
Robbery, but fine." — and the engine dropped it on the floor without a word, because
`accept` matches item ids by exact string while `give` forgives them, and every price
a model has ever named in this world is a phrase.**

## 2026-08-09 01:05 PDT — sample 1,474, game hour 4.3 (`at` 22318) — RUN STILL LIVE, NOT SPENT

Spend 1,412 of 6,000. Eachann 1,115 calls / 1 failure. Coinneach 297 / 130 (`no json
in reply`, 44%). Neither seat carries `SPENT`; everything below is the models.

Only ~96 samples since the last entry, so most of the previous entry stands unchanged
(`accept` still never fires, `note` still empty, `plan` still used, `say` still the
win). One thing happened in that window that had not been caught before, and it
settles an open question with a body.

### The `accept` bug killed a mind, and both models were doing everything right

`at21662 → at21793`, eleven consecutive samples, Coinneach at food 0, health running
`100 → 92 → 81 → 70 → 59 → 48 → 37 → 26 → 15 → 4 → dead`.

His goal did not change once across the entire death:

```
goal = take Eachann offer     why = starving, taking meat for arrows
said = "Done. Give me the meat." / "Done. Six arrows for the meat."
       / "Six arrows. Give me the meat."
```

Eachann, in the same eleven samples, was on `give meat to Coinneach` (h21633,
h21662) and `offer meat to Coinneach for 6 arrows` (h21735), saying *"six arrows for
the meat"*, *"done, six arrows now"*.

**A seller offering, a buyer accepting, a price both had said out loud, and a man who
starved to death holding the intention to take the deal.** This is A68's exact-string
`resolveAccept` — `countOf("6 arrows")` against the id `arrow` — with a corpse
attached. The mechanism was already known; what is new is that it is now the proximate
cause of a death, not just a missing feature. Neither mind was told the deal failed
(A48), so neither ever tried a different framing across eleven turns of dying.

### Correction to A52 — the pack survives starvation; A52 generalised from a mauling

A52 says **DEATH CONFISCATES THE PACK**. Over the full run, `hp ≤ 20 → hp ≥ 95`
fires **25 times** (Eachann 12, Coinneach 13), and in **24 of 25 the pack is
byte-identical across the death.** Coinneach's, at `at21808`:

```
before  hp4  food 0   [bow:1, wood:6, arrow:18]
after   hp100 food 84 [bow:1, wood:6, arrow:18]
```

24 of those 25 are `food 0 → 84/85` — starvation. The one exception (`at16487`,
Eachann, food **51**, wood 154 → 40) is the other death rule, and it did not empty the
pack either; it trimmed wood only, which looks like a carry cap on respawn rather than
confiscation. A52's own evidence was a single troll mauling at food 23. So this is
A58's two death rules again: **the mauling path takes your kit, the starvation path
takes nothing at all, and starvation is 24 of 25 deaths.**

A52's second half is untouched and confirmed harder than before: **the mind is never
told.** After respawning at `at21808` with food 84, Coinneach ran eight more samples
still reasoning `why = starving, taking meat for arrows`, then `why = need that meat
before dark` at food 81. He was fed to 84 and spent two minutes of wall clock
bargaining for a meal because nothing in the brief ever mentioned that he had died and
been filled up.

### What this makes of the food numbers

25 deaths in 490 real minutes, and dying costs one sample of wall clock and restores
food to 84. There is no reason for either mind to manage food at all — and neither
does. Eachann ends the run holding 40 branches, 7 hides and 14 arrows at food 19,
having gathered 804 branches; he is the richest man in the world and starves on a
schedule. That is not the model misplaying scarcity. It is a world where the punishment
for running out is a free refill.

### The one-line version

**Coinneach starved to death over eleven turns while holding the goal `take Eachann
offer`, with Eachann on `give meat to Coinneach` the whole time — and then kept his
entire pack through the death, because starving in this world is free.**

## 2026-08-09 01:34 — RUN 2, samples 1474–1565: the `refusedVerbs` census

Board answered (`at 23689`, sim h9.2). **Neither seat is `SPENT`** — Eachann 1,185
calls of 1,500, Coinneach 315 of 1,500. Everything below is the models, not the
scripted brain. Coinneach's parse failures are now **139 of 315 (44%)**, all
`no json in reply`; A25's one-shot repair retry is still the remedy and still not in.

Only 91 samples since the last entry, so most of that entry stands unchanged. But
those 91 let me close a census that has been open since A31 → A45 → A63, and the
answer is worth the whole entry.

### `refusedVerbs` logged exactly one verb in 1,565 samples, and it was not a trade verb

Whole-run census, both cards, every sample:

```
{"avoid": 16}     — Eachann only.  Coinneach's card: {} for all 1,565 samples.
```

That is the complete contents. `accept` never appears. `offer` never appears. `give`
never appears. Over the same run, `take <name> offer` was chosen as a goal **17
times** and produced **zero** `accept` deeds; `offer` was chosen **24 times** and
produced zero deeds of any kind.

This settles A63 with a number. A failed `accept` is not counted as a refusal because
it is not *refused* — `resolveAccept` matches, misses, and returns, and nothing
anywhere increments. **The column added so that "reached for and refused" would look
different from "nobody wants it" is blind to the one verb we know is broken.** Both
still render identically: as absence.

### The 16 refusals it did catch were a badly hurt man refused permission to run

All 16 land in four consecutive samples, 678–681, sim hour 0.5 → 1.4:

```
h0.5   avoid → 2    goal = keep away from troll   why = too close to it
h0.8   avoid → 8    goal = keep away from troll   why = too close to it
h1.1   avoid → 13   goal = keep away from troll   why = badly hurt, no food
h1.4   avoid → 16   goal = make for Black Moss    why = ... need gear first
```

Then never again across the remaining 884 samples. A mind at low health with a troll
on it picked the correct verb sixteen times in under an hour, was refused every time,
and then abandoned the verb permanently. This is the only thing `refusedVerbs` has
ever caught — and it is a live gameplay defect, not an instrumentation one.

### The same bargain is still open, long after it killed him

Verbatim from the current window:

```
Eachann    "six arrows or no deal"  /  "that's mine, find your own"
Coinneach  "Six arrows. Give me the meat."  /  "six arrows for your meat. Done."
Coinneach  "Eachann, quit your bleating"
```

Deeds in those same 91 samples: `gather 71, place 14, craft 1, give 1, accept 0`.
Coinneach sits at food 29, gold 0. This is the identical six-arrows-for-meat trade
that A73 watched starve him to death at `at21793`. Both minds have now been trying to
close the same deal for effectively the entire run, and the world has never once told
either of them why it will not close.

### Re-checked, unchanged

- **`note`: never used by either mind in 1,565 samples.** Sixteenth check. A70 stands — retire it.
- **`plan`: used by both, and it tracks what they say.** Eachann `["get meat","trade with Coinneach"]`; Coinneach `["gather what I can","get arrows somehow","hunt when I can shoot"]`.
- **`give` is still a one-way pump.** 59 unique give deeds across the run, **all 59 from Eachann**. Coinneach has never given anything to anyone, while saying "I'll owe you" a dozen ways.
- **Fires: 165.** Coinneach carries 94 branches. A71 stands — the 10-branch price did not bite.
- **Speech remains the one unambiguous win.** ~70 distinct lines from Coinneach alone, against ONE sentence across two prior days and six models.

### The one-line version

**`refusedVerbs` has logged one verb in 1,565 samples — `avoid`, 16 times, to a man
fleeing a troll — and has never once logged the broken `accept`, because from the
board a silent drop and an unwanted verb still look exactly the same.**

## 2026-08-09 02:05 PDT — RUN 2, samples 1565–1652: the gather counter is a bout meter, and the dispute is a phantom

Board live (`at 24989`, sim h10.8). **Neither seat is `SPENT`** — Eachann 1,247 calls
of 1,500, Coinneach 332 of 1,500. Everything below is the models. Coinneach's parse
failures: **144 of 332 (44%)**, all `no json in reply`, flat since 01:34. Spend 1,576
of 6,000.

87 new samples, ~29 real minutes. Two things in them, and the first invalidates a
number I have quoted three times in this file.

### `gather` is not an event on this board — it is a running total that mutates in place

The trailing `gather wood` deed **keeps its slot and counts up** while a mind walks.
Verbatim, Coinneach, samples 1618–1648, one continuous stretch:

```
sample 1618  h1.83   gather wood 3     wood carried 19
sample 1621  h2.75   gather wood 12    wood carried 28
sample 1628  h4.83   gather wood 29    wood carried 45
sample 1635  h6.91   gather wood 39    wood carried 55
sample 1648  h10.83  gather wood 68    wood carried 84
```

One bout. Sixty-five branches. The `n` climbs and the carried total climbs in exact
lockstep — **and the game-hour stamp advances with it**, so keying on `(who, hour)`
does not dedupe it either. Every sampler-based count of gathering in this project has
therefore counted one bout dozens of times.

| | as counted before | actual |
|---|---|---|
| wood-gather "events", whole run | 919–988 | **186 bouts** (Eachann 115, Coinneach 71) |
| branches gathered | 12,961–13,421 | **2,219** |
| mean per event | 14.6 / 15.6 | **11.9** |

**A60's 11.6 survives** — that figure was right and I will stop revising it. What does
not survive is the event count, and `analyse.mjs`'s `GATHERS: 988` line, which is
inflated about five-fold. Deeds that carry an `n` mutate; `place`, `craft`, `killed`,
`give`, `eat` do not, so those counts hold (**fires 171**, crafts 30, kills 16,
gives 59, eats 17, **accepts 0**).

### What that changes: gathering is a rate, and you cannot price against a rate

Reading it as a bout gives the number nobody had: **Eachann collects ~13.8 branches
per game hour, Coinneach ~8.1, continuously, just by walking with the goal set.**

A fire costs 10 branches. That is **under one game hour of walking** — for a mind that
is walking anyway. This is why the 10× price rise did nothing (A71) and why 171 fires
have been lit into a standing surplus: the cost is an *event* and the supply is an
*income*. No price on a one-off action can bind against an unbounded drip. The lever
is the rate or a carry cap, not the price.

### The property dispute both minds are having is with nobody

The new speech this window is a carcass-ownership argument, and it is good writing:

```
Coinneach  "I downed it. Find your own, Eachann."   why = no food in my pack
Coinneach  "you didn't fetch it, Eachann"
Coinneach  "finders keepers, Eachann"
Coinneach  "I'll carve what's mine"                 why = hungry, my kill is near
Eachann    "that's mine, find your own"             why = get meat before Coinneach
Eachann    "mine, six arrows or no deal"            why = claim my kill
```

Two competing property norms — *I shot it* against *finders keepers* — argued by name,
unprompted, with nothing in the game modelling carcass ownership at all.

**They are in different valleys.** Across the 94 samples of this window they are
quoted off the **same landmark once**; the other 93 are Eachann around Heather Scaur /
Low Rigg / Broad Loch and Coinneach around The Sheiling Wood / Kindly Wood. Each is
standing over a *different* deer — Coinneach killed two in this window (h16.4, h22.5),
Eachann one (h13.7) — telling the other to find his own.

Two men several hundred metres apart, shouting "that's mine" at each other about two
separate animals neither can see.

**Honest limit:** the board still has no `heard` field, so I cannot *prove* nothing
landed — only that they were quoted off different landmarks in 93 of 94 samples, which
puts them well outside the 140 m notice range. That is A0f, still open, and this is the
sharpest illustration of it since the first sentence ever spoken in this world.

This is A11 in a stronger form. Speech is no longer "nobody speaks *to* anybody" —
they now address each other by name, constantly and in character. The problem moved:
**the addressing works and the delivery does not, and neither mind is told which.**

### The plan field is now holding a threat the verb set cannot express

Coinneach's plan, current: `["cook it up", "keep an arrow nocked for Eachann"]`.

Whole-run check: **`attack`, `follow` and `guard` have never once appeared as a goal**,
in 1,652 samples. This is A9's exact shape a second time — a mind writes its intention
into the plan field, reads it back on every call, and never selects the verb. It was
`trade a hide for food` in run 2's first hour; it is a nocked arrow now.

### Re-checked, unchanged

- **`note`: zero uses, seventeenth check.** A70 stands.
- **`accept`: 0 deeds, whole run.** 59 gives, still all Eachann.
- **`refusedVerbs`: `{"avoid": 16}` on Eachann, `{}` on Coinneach.** Unmoved since
  sample 681. A75 stands.
- **Carcasses work (A65).** Kills 16, eats 17, venison gathered by both. Coinneach in
  this window: killed → `I made 3 cooked venison at the fire` → ate. The loop closes.
- Coinneach crafted **44 arrows** this window and holds 21. The six-arrows-for-meat
  deal that starved him at `at21793` is now moot — he solved his own arrow supply, and
  the conversation moved from trade to ownership.

### The one-line version

**Every gathering statistic in this file was five times too high because the `gather`
deed is a bout meter that counts up in place — and read correctly it says branches
arrive at ~11 an hour just for walking, which is why a 10-branch fire has never once
been a real price.**

## 2026-08-09 02:35 PDT — RUN 2, samples 1652–1744 (`at 26370`): THEY MET, THEY DEALT, AND THE ENGINE IS ROBBING THE MAN WHO PAID

Board live. **Neither seat is `SPENT`** — Eachann 1,318 calls of 1,500, Coinneach 351
of 1,500. All of this is the models. Coinneach's parse failures 152 of 351 (**43%**,
all `no json in reply`, flat). Spend 1,669 of 6,000.

This is the window everything else in this file was waiting for, and it goes wrong in
a new way.

### The first two-way trade in this world's history, and it half-executed

They **found each other.** 28 of 91 samples this window put both minds on the same
landmark; the last nine put both `in Heather Scaur`, standing together. Then, out loud:

```
Coinneach  "one hide for one venison, you said"    why = he owes me meat for it
Eachann    "hide for the meat then"                why = he needs meat, I need hides
Coinneach  "here. now the venison"
```

And the goods moved — **once**. Traced by sample index, not game hour:

| sample | Eachann hide | Eachann venison | Coinneach hide | Coinneach wood |
|---|---|---|---|---|
| 1740 | 12 | 3 | 1 | 141 |
| **1741** | **13** | 3 | **0** | 140 |
| 1742 | 13 | 3 | 0 | 134 |
| 1744 | 13 | 3 | 0 | 123 |
| live | 13 | **3** | 0 | **101** |

At 1741 `give hide` fires correctly: Coinneach 1→0, Eachann 12→13. **Coinneach paid.**
Eachann's venison has not moved off 3 since — through the whole meeting, right now,
standing next to him, goal `"offer cooked venison to Coinneach for hide"`, why
`"stick to the deal"`.

### And then it kept charging him

Coinneach's goal is still `"give hide to Eachann"`, why `"we agreed one for one"`. He
has no hide. `giftFrom` ([src/sim/world.js:802](src/sim/world.js:802)) resolves a gift
you cannot make by falling through to **the largest stack in your pack**:

```js
if (named && p.inventory.countOf(named) > 0 ...) return named;
for (const id of EDIBLE) if (p.inventory.countOf(id) > 0) return id;
// else: the biggest stack you own
```

His largest stack is firewood. So the engine has been paying Eachann **out of
Coinneach's woodpile, six branches per 20-second sample, and has not stopped**:
141 → 101 branches, **40 gone and counting**, on top of the hide. Eachann's wood went
5 → 29 and his arrows 1 → 13 — **he is fletching arrows out of the drain.**

Running total for the one bargain both models closed in good faith: Coinneach has paid
1 hide + 40 branches. Eachann has paid nothing.

### Why Eachann is not the liar here

`offer` ([world.js:729](src/sim/world.js:729)) is *words* by design — it posts
`from.offer` and an event and **moves nothing**. The transfer is `accept`'s job, and
`accept` has fired **0 times in 1,744 samples**. Eachann picked the correct verb for
"I'll trade you"; there is simply no path from a posted offer to delivered goods that
either model has ever managed to walk. This is the third distinct instance of the same
root cause: **`give` is charitable to the point of fraud and `accept` is unusably
strict** (see 00:34 entry).

### Corrections to my own earlier entries

- **"59 gives, still all Eachann" is now wrong.** Coinneach gave **7** times, all in
  this window — the first gives he has made in the run. Whole run: Eachann 59,
  Coinneach 7. The payment direction did reverse; it reversed *into a leak*.
- **"quoted off the same landmark once in 94 samples" (02:05) no longer holds.** It is
  28 of 91 now, and they are together as I write. A80's phantom-dispute reading was
  true of *that* window and is not true of this one. The speech is landing now.

### Re-checked, unchanged

- **`note`: zero uses, eighteenth check.** Both cards `""`. A70 stands.
- **`refusedVerbs`: `{"avoid": 16}` on Eachann, `{}` on Coinneach.** Unmoved since
  sample 681 — **and the 40-branch drain does not appear in it**, because a silent
  substitution is not a refusal. A75 stands and just got its worst example.
- **`accept`: 0 deeds, whole run.** Fires: 177 sampled. Kills 18, eats 19.
- Gather counts still bout meters — not re-quoted here (see 02:05).

### The one-line version

**Both minds met, agreed one hide for one venison, and Coinneach delivered — then his
unfulfillable second `give` made the engine pay Eachann out of his woodpile six
branches at a time, 40 so far, while Eachann's three venison never moved and nothing
on either card said a word about it.**

## 2026-08-09 03:05 PDT — RUN 2, samples 1744–1834 (`at 27630`): THEY HAVE BEEN QUOTING PRICES ALL DAY AND THE TRADE VERBS CANNOT HOLD A NUMBER

Board live. **Neither seat is `SPENT`** — but read the budget note below before the next
entry. Eachann 1,381 calls of 1,500, Coinneach 368 of 1,500. All of this is the models.
Spend 1,749 of 6,000. Game hour 16.6 → 20.3.

### The finding: `offer` and `accept` have no quantity field, and never have

Every priced bargain either mind has struck names an amount out loud. Verbatim, from
the 132 distinct utterances this run:

```
"fifty branches for your meat. I'm hungry."
"nine branches for arrows, or I'll owe you"
"One hide for two venison. Now."
"Six arrows. Robbery, but fine."
"Forty-eight. I owe you two branches."
```

The primitive they are aimed at is this, [world.js:729](src/sim/world.js:729):

```js
from.offer = { to: to.id, item, want };     // no count. anywhere.
```

and it clears, [world.js:766](src/sim/world.js:766), like this:

```js
giver.inventory.remove(deal.item, 1);
taker.inventory.remove(deal.want, 1);
```

**One of a thing for one of a thing.** The wire agrees — `offerItem` and `offerWant`
are the only two fields in the protocol ([agent.js:1194](src/net/agent.js:1194)), and
there is no third. So *"fifty branches for your meat"* was not a hard bargain the engine
refused; it was a sentence with no representation. Neither model was ever wrong. They
were negotiating in a currency the verb set cannot spell.

This reframes the whole `give`-spam problem. Coinneach paying Eachann one branch per
model call, forty-one calls deep, is not a bug in `give` alone — **it is the only way to
express a quantity in this world.** A48/A82 fix the leak; they do not give anybody a
price.

### `take Coinneach offer` fired, and died on a null

At h19.24 Eachann's card read, exactly:

```
goal  "take Coinneach offer"
why   "he agreed to the trade"
said  "here is your venison"
```

He reached the clearing verb *by name*. Nothing moved. Coinneach had not posted an
offer — his goal at the time was `give hide to Eachann` — so `resolveAccept` hit
`if (!deal || deal.to !== taker.id) return;` and stopped.

`resolveAccept` has **eight bare `return`s** and not one of them reaches the mind, the
board, or `refusedVerbs`. From where either model sits, a correctly-chosen verb against
a live partner is indistinguishable from a verb that does not exist.

And there is a worse one three lines down:

```js
if (taker.inventory.countOf(deal.want) < 1) return;
```

**The buyer must already be holding the seller's asking price.** Coinneach had just
handed over his only hide; every accept he could have attempted was dead before it was
checked. Two minds, in reach, both willing — and the precondition is one neither could
satisfy.

### The 41-branch drain stopped, and the engine had nothing to do with it

Traced by sample: Coinneach's wood 123 → 100 by h17.80, then back up to 167 as he
re-gathered. The gives stop at h17.80 for one reason — **his goal moved off `give hide
to Eachann` on its own.** Nothing refused him, nothing told him, and nothing capped it.

Final bill for the one bargain both models closed in good faith, whole run:

| | paid | received |
|---|---|---|
| Coinneach | 1 hide + 41 branches | **nothing** |
| Eachann | nothing | 1 hide + 41 branches |

Eachann's 3 venison at sample 1834 are **his own** — he killed a deer at h18.27 and
gathered them at h18.60. Coinneach ends the window on 0 hide, 0 venison, 0 cooked, and
fed himself by hunting. He was not paid; he recovered.

### One gathering bout ate the entire night

Coinneach's deed line, consecutive, h21.52 → h04.72:

```
3 · 6 · 8 · 11 · 15 · 17 · 22 · 23 · 27 · 30 · 34 · 37 · 42 · 45 · 48 · 51 · 54 · 56 · 61 · 65 · 68 · 72 · 78 · 79  →  "I set a fire going"
```

That is **one continuous bout counting up in place for seven game hours**, ending at 79
branches and one fire. It confirms the bout-meter reading (c05017b) on a clean single
run, and it prices the fire honestly: **10 branches is about three minutes of one
bout.** Wood is the only unbounded free good in the world, and it is what both minds
spend their nights on.

### Correction: every hit-rate number in this file is unsound

`astray` exceeds `loosed` on **both** cards, all run — Eachann 79 astray / 45 loosed,
Coinneach 232 / 183. [board.js:190](server/board.js:190) calls loosed "the honest
denominator". The denominator is smaller than the numerator, because `astray` is
`strays.length` off the `shots` log while `loosed` counts `releases` with the loosed
flag, and the two logs do not agree.

I was one paragraph from reporting "Coinneach hits 3%, Eachann 31% — kimi shoots into
the ground". **I cannot support that and neither can any earlier entry that quoted these
two fields together.** The asymmetry may be real; the arithmetic behind it is not.

### Budget, loudly, for whoever reads the next board

**Eachann is at 1,381 of 1,500 calls — 92%** — and burned 66 in the last 26 minutes.
He hits `SPENT` in roughly **45 minutes**, and from that moment his card is the scripted
brain. Coinneach is at 368 (25%) only because **44% of his calls never parse** (162
failures, all `no json in reply`; 10 of 18 in this window alone, 56% — it is getting
worse, not better). The 20 s / 75 s cadence split means the budget is spent 4:1 by
clock speed rather than by anything either mind is doing.

### Re-checked, unchanged

- **`note`: zero uses, nineteenth check.** Both cards `""`, 1,834 samples. A70 stands.
- **`refusedVerbs`: `{"avoid": 16}` on Eachann, `{}` on Coinneach.** Unmoved since
  sample 681. The eight silent returns above are exactly why. A75 stands.
- **`accept`: 0 deeds in 1,834 samples** — now with a live instance of a model
  *choosing it* and getting nothing.
- **`attack`, `follow`, `guard`: never once a goal**, whole run, while Coinneach's plan
  says `"keep an arrow nocked for Eachann"`. A81 stands.
- Speech works and is not the problem: **132 distinct utterances**, in character, by
  name, both directions. Carcasses work (A65): 19 kills, 20 eats, venison gathered and
  cooked by both.

### The one-line version

**Both minds have spent all day quoting each other prices in branches and arrows, and
the trade primitive moves exactly one item for one item with no count field anywhere in
it — so the only way to pay fifty branches in this world is fifty model calls, which is
precisely what the board recorded.**

---

## 2026-08-09 03:35 — RUN 2, ELEVENTH LOOK: thirty deaths, one of them cost anything, and it took the run's whole treasury

1,918 samples · 639 real minutes · game hour 21.9 · 1,826 calls of 6,000.
Board live. **Neither seat is `SPENT`** — but see the budget note at the bottom.

### The finding: two death paths, opposite loot rules, and the punishing one is silent

Counting respawns by the signature `food ≤ 3 → food 84–85` **and** `hp → 100`
(rather than by catching `hp === 0`, which the 20 s sampler misses four times in
five) the whole run holds **30 respawns — 13 Eachann, 17 Coinneach.**

**Twenty-nine of them cost nothing at all.** Full health, a belly at 84–85, a
teleport across the map, and the pack intact to the item. The clean case, Eachann
at s1356→s1357:

```
s1356 h17.2  hp=  0 food=0   carry: bow x1, hide x5, arrow x1
s1357 h17.5  hp=100 food=84  carry: bow x1, hide x5, arrow x1
```

**One cost everything.** Coinneach, s606→s607, hour 2.6:

```
s606 h2.3  hp= 39 food=0   carry: bow x1, hide x13, gold x2, wood x3
s607 h2.6  hp=100 food=85  carry: bow x1
```

Note the `hp=39`. Every other respawn in the run fires from hp 0–9, off the
starvation ramp (a clean −11 per sample). This one fires from 39, mid-ramp — a
creature closed the last 39 in one tick. His goal at s598 and again at s610 is
`"keep away from a goblin"`.

That is the difference, and it is in the source. `onPlayerDied`
([world.js:918](src/sim/world.js:918)) drops the pack and pushes `k:'death'`, and
it is called from exactly two places — `world.js:353` (arrow) and `world.js:849`
(creature). `KEEP_ON_DEATH` is `new Set(['bow'])` ([world.js:33](src/sim/world.js:33)),
so a creature death strips you to the bow. Starvation never reaches that function
at all; `Vitals` revives itself at [vitals.js:155](src/player/vitals.js:155).

**This resolves the loose end in A39.** That entry counted twelve respawns and
noted "eleven of the twelve kept the full pack" without explaining the twelfth.
The twelfth is this one. It is not a glitch in the starvation path — it is the
*other* path, working as written.

### Why it matters more than a loot rule

**13 hides and 2 gold is the largest concentration of wealth this run produced,
and the largest hide movement in 639 minutes was not a trade.** Both minds spent
the entire day pricing meat in hides, out loud, by name — *"one hide for one
venison"*, *"Hide for meat, Eachann. You have plenty."*, *"one hide gets you one
venison"*. Coinneach's 13 hides were the buying power for every one of those
bargains. A goblin deleted them at hour 2.6 and he negotiated for the next
nineteen hours without them, ending the window on 2.

He was not told. The `death` event does reach his memory
([agent.js:542](src/net/agent.js:542)) — but as
`"Coinneach was killed by Goblin <place>"`: third person, no first-person framing,
and **no mention that his pack is lying on that square metre.** The event object
carries `lost: dropped.length` and it is never rendered. His card is otherwise
byte-identical across the wipe — same three deeds (`gather:wood x10 | place |
gather:wood x3`), same goal (`"hunt a deer"`), same `why` (`null`). From inside
the mind, thirteen hides simply stopped existing.

### Not a model failure — two data points the other way

- **Coinneach's speech was accurate about his own inventory.** He says *"Eachann,
  quiet. I have no hide."* (s1768) and *"Starving. No hide. Give me venison, I
  will owe you."* (s1799). He held **0 hides at both**. I checked this expecting
  the opposite — the live board shows him carrying 2 — and the 2 arrive at s1886,
  after both lines. He stopped saying it once he had them.
- **The impasse that closed the run is priced, not confused.** Eachann's price is
  one hide; he has held **hide x15 since s1829** and has never once lowered it.
  Coinneach had 0 hides for the whole negotiation. Two minds bargaining in a
  currency one of them has fifteen of and the other has none of, with no
  diminishing return to make the seller want anything else. *"my kill, my price"*
  / *"Keep your hide-price, I'll fill my own belly."* Both then fed themselves by
  hunting. **That is a correctly-reasoned deadlock, not a failure to reason.**

### Re-checked, unchanged

- **`note`: zero uses, twentieth check.** Both cards `""`, 1,918 samples.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since sample 681. Note what
  it did *not* record: a creature killing a man and taking his pack.
- **`accept`: 0 deeds in 1,918 samples.** Never once, by either model, all run.
- **`plan` is genuinely used and stable** — `["get meat","trade with Coinneach"]`
  and `["get meat","keep an arrow nocked for Eachann"]`. Both on-topic, both
  survive. `plan` is the one self-written field that works; `note` is dead.
- **Gold moved between minds exactly twice**, one coin each way — s332 (E 2→1,
  C 0→1) and s403 (E 1→0, C 1→2) — then the goblin took both at s607. Gold has
  been 0/0 for 1,300 samples since.
- Speech remains abundant and in character: ~230 distinct utterances, both
  directions, by name.

### For whoever reads the next board

- **Eachann is at 1,442 of 1,500 calls (96%)** and burning ~2.2/min. He hits
  `SPENT` in roughly **25 minutes** and his card is the scripted brain from then
  on. If you read this run after that, most of what you see is not grok.
- **Coinneach's parse failure rate is 45% all-run (172/384) and 63% in the last
  window** (10 failures in 16 calls), all `no json in reply`. Nearly two of every
  three kimi calls are thrown away.

### The one-line version

**This world killed its inhabitants thirty times in eleven hours; twenty-nine of
those were a free meal and a fast-travel, and the one that actually cost something
took the entire hide treasury both minds had spent all day bargaining over — and
told neither of them.**

---

## 2026-08-09 11:10 PDT — RUN 2, TWELFTH LOOK: the seat went `SPENT` mid-bargain, and the board froze holding a deal for meat that never existed

2,020 samples · 11.2 real hours · 1,902 calls of 6,000. Board live.

### Read this before you read the board

**Eachann is `SPENT`.** First seen at **s1997, 10:57:37**, at exactly 1,500 / 1,500
calls. The 03:35 entry predicted this ~25 minutes out and burning ~2.2 calls/min;
it landed at 26 minutes. **Everything on Eachann's card after 10:57:37 is the
scripted brain, not grok** — that is the last 23 samples and the live board right now.

The signature to recognise it by, because it is a trap:

```
s1996  E calls1499       goal: pick up what is lying about   said: "one hide for your venison? done"
s1997  E calls1500 SPENT goal: pick up what is lying about   said: "one hide for your venison? done"
s1998  E calls1500 SPENT goal: find shelter and settle...    said: "one hide for your venison? done"
   ...23 samples, goal frozen, said frozen...
```

`said` is a last-3 rolling buffer and the scripted brain never speaks, so **the
model's final sentence stays pinned to the card forever.** The live board at this
moment shows Eachann saying *"one hide for your venison? done"* three times over
while holding hide ×19. It reads exactly like a mind actively closing a trade. It
is a dead string. This is the sixth time the instrument has made a model look like
something it isn't, and the first time it has done it by *flattering* one.

### The finding: 21 minutes of agreement over goods the seller did not have

Coinneach held the goal `offer hide to Eachann for venison` for **63 of the 120
samples since s1900** — twenty-one minutes — and said it six different ways:

> *"one hide for venison, I'm starving"* · *"one hide for venison, fair trade"* ·
> *"Hide for meat. Now."* · *"one hide, one share. Done."* · *"One hide for venison."* ·
> *"my hide, your meat."*

Eachann answered *"one hide one share"* from s1960, then at **s1991** flipped to
*"one hide for your venison? done"*. Both cards, simultaneously, on the same price.

**Nothing moved.** Eachann's hides go 15 → 17 → 19 across the window (his own
gathering); Coinneach sits at 2 throughout. No venison on either side, ever.

And the reason is not only the broken `accept` (0 deeds in 2,020 samples, twelfth
check — see the 02:05 and 03:35 entries). It is simpler and worse:

**Eachann carried zero venison in all 120 samples of the negotiation.** His pack
across the whole window is `bow ×1, hide ×19, arrow ×7`. Coinneach spent
twenty-one minutes buying meat from a man with an empty larder, and the man agreed
to sell it. Neither could have known: a mind is given its **own** `carrying`
([WHAT-A-MIND-IS-GIVEN.md:22](WHAT-A-MIND-IS-GIVEN.md:22)) and is told of others
only as a name and a bearing — *"also out there: Coinneach, a long way south-west"*
([agent.js:2574](src/net/agent.js:2574)). **There is no way to see what another
person is carrying, so every bargain in this world is struck blind on both sides.**

The order of events is the sharp end of it. Coinneach abandoned the offer at
**s1990** — one sample *before* Eachann said "done". Eachann went `SPENT` seven
samples after that. The only deal two models ever talked all the way to yes
expired because the buyer gave up one turn early, the goods were imaginary, and
then the seller ran out of money.

### Where the run stands as of 11:04:57

**Coinneach is at food 0 and on the starvation ramp**, carrying `bow, arrow ×14,
hide ×2` — the buying power he spent all night trying to acquire, and nobody left
to spend it on. He has 403 / 1,500 calls, so he will keep thinking; the other mind
in his world is a script that will answer *"one hide for your venison? done"* until
the process is killed. **The run is effectively over as a two-model experiment.**

### Re-checked, unchanged

- **`note`: zero uses, twenty-first check.** Both cards `""`, 2,020 samples.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since s681. It did not record
  63 samples of an offer going nowhere.
- **`plan` still works** — `["get meat","trade with Coinneach"]` (648 samples) and
  `["get meat","keep an arrow nocked for Eachann"]` (334). Twenty distinct plans
  from Coinneach, five from Eachann, all on-topic, all durable.
- **Speech is abundant** — 179 distinct utterances from Eachann, 100 from Coinneach.
- **Coinneach's parse failure is 43.7% all-run (176/403)**, all `no json in reply`.
- Gather counts remain bout meters (02:05 entry); no branch totals quoted here.

### The one-line version

**Two models talked a trade all the way to "done" on both cards at once — for meat
the seller had never had, in a world where neither can see the other's pack — and
the buyer quit one turn early, the seller's call budget ran out seven turns after
that, and the board has been showing his last words as a live offer ever since.**

---

## 2026-08-09 04:33 PDT — RUN 2, THIRTEENTH LOOK: samples 1997–2107, the whole window post-`SPENT`

**The board still answers** (`at 31522`, spend 1,920 / 6,000). Eachann went
`SPENT` at **s1997** and has been the scripted brain for **112 samples / 35.7
real minutes**. Everything below about Eachann is the rules engine, not
grok-4.20. Coinneach (kimi-k2.6) is still a live model: 420 / 1,500 calls.

### Correction: A94 is wrong about `goal`. The scripted seat's goal is *not* frozen.

A94 (written at s2020, off a 23-sample window) says of the `SPENT` card:
*"His `goal` is likewise frozen."* **It is not.** Over the full 112 samples the
scripted Eachann made **26 goal transitions** across six distinct goals:

```
 50  find shelter and settle for the night      6  stay still and watch
 29  walk the country and see what is about     2  keep away from a goblin
 13  hunt a deer                                8  pick up what is lying about
```

A94 caught it mid-stall — the rules brain did hold `find shelter` from s1998 to
s2020, which is exactly the window A94 measured. Twenty-two samples of stillness
read as a dead card; it was a script doing its job.

**This makes the problem worse, not better.** A card whose goal rotates
plausibly through six survival intents *looks alive*. The `where` moves, the
`hours` tick, the deeds accumulate.

### The only field that betrays a `SPENT` seat is speech

Across all 112 post-`SPENT` samples, Eachann's `said` had **exactly one distinct
state**:

```
["one hide for your venison? done", "one hide for your venison? done", "one hide for your venison? done"]
```

324 renderings of one sentence. The scripted brain never writes `say`, so `said`
is a last-3 rolling buffer that stopped rolling. **Speech is the single tell, and
the board renders a 36-minute-old fossil in the same type as a live sentence.**
A94's prescription (blank or stamp `said` on `SPENT`) is right; its reasoning was
half wrong.

### What it cost the surviving model

Coinneach spent the window bargaining with a script that cannot answer:

| | |
|---|---|
| calls | 399 → 420 (**+21**) |
| failures | 173 → 183 (**+10**, all `no json in reply`) |
| tokens | +69,902 |
| samples still on `offer hide to Eachann for venison` | 7 |
| samples on `go toward Eachann` | 3 |

He is still saying it out loud — *"One hide for venison, Eachann. I'm starved."*
(76 samples), *"Hide for meat. Now."*, *"one hide, one share. Done."* Ten of his
twenty-one thinking calls in this window were burned on parse failures, and the
other eleven were spent negotiating with a rules engine.

### New utterance worth the roadmap: *"dead meat won't walk to me"*

Coinneach's **most-used line in the window (93 samples)**. It is a model naming a
verb the world does not have: he can kill a deer at range and cannot bring the
carcass to him. `gather venison` only works standing on it — the same walk-to
courtesy that `offer` and `give` were given in the 08-08 fixes was never extended
to harvesting.

### Fires: the 10-branch price worked, but only about a third

Normalised per sim-day, which is the only fair comparison (run 1 is 8.5 sim-days,
run 2 is 27.0):

| | run 1 (1 branch) | run 2 (10 branches) |
|---|---|---|
| fires lit (deduped) | 110 | 214 |
| **fires per sim-day** | **12.9** | **7.9** |
| peak wood carried | 82 / 28 | **154 / 178** |

A 10× price rise bought a **39% fall** in fire-lighting, not a collapse — and the
woodpiles got *twice as big*. A15 quoted "106 fires → 24" and peaks of 67/45 off
a short early window; **at run scale those numbers do not hold** — the peaks are
now 154 and 178. Wood is bimodal, not scarce: over 4,214 player-samples, **57%
are carrying fewer than 10 branches** (below the price of one fire) and **14% are
carrying 50 or more**. They are either broke or hoarding, and gathering is cheap
enough to flip between the two in an afternoon. A15's own second option — make
branches slower to find rather than fires dearer — is the one the evidence now
supports.

### Re-checked, unchanged

- **Carcasses work, twenty-second confirmation, twice in this window** — s2047
  `Coinneach: I picked up 2 venison`, s2079 `I ate what I had, raw`. Run-wide the
  gather → craft → eat chain fires 20+ times for both minds. **A0c stays closed.**
- **`note`: zero uses, twenty-second check.** Both cards `""`, 2,107 samples.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since s681. It did not record
  a single one of Coinneach's seven dead offers.
- **`plan` still works** — `["get meat","trade with Coinneach"]` /
  `["find firewood","get meat if it's near"]`. Both on-topic, both durable.
- **Trade: still zero.** No `accept` deed in 2,107 samples.

### The one-line version

**The scripted seat is not a frozen card — it walks, hunts and shelters through
six plausible goals, and the only thing that gives it away is one sentence it has
been repeating for thirty-six minutes; meanwhile the last live model in the world
spent twenty-one calls and seventy thousand tokens trying to sell it a hide.**

---

## 2026-08-09 05:06 PDT — RUN 2, FOURTEENTH LOOK: the scripted seat cannot feed itself

**The board still answers** (`at 32986`, spend 1,939 / 6,000). Window is samples
2108–2201, **21 real minutes**. Eachann has been `SPENT` since **s1998** — 203
samples, ~66 real minutes of rules engine. Coinneach (kimi-k2.6) is still live:
**439 / 1,500 calls, 192 failures (43.7%)**, all `no json in reply`.

### The finding: the fallback brain never eats, so a `SPENT` seat is a death treadmill

Across all 203 post-`SPENT` samples, Eachann's distinct deeds are:

```
gather 45   ·   place 13   ·   killed 1   ·   eat 0   ·   craft 0
```

**Zero eat deeds. Zero craft deeds.** Before `SPENT` the same seat logged 18
distinct eat deeds. The rules brain gathers branches and lights fires — the two
things it does well — and never once cooks or eats, while `food` drains from 85
to 0 on the sim-day clock.

The result is a loop that has now run three times:

| death | sample | sim hour | health before | food before | pack after |
|---|---|---|---|---|---|
| #20 | s2043 | h12.0 | 0 | 0 | `bow, hide×19, wood×9` — **identical** |
| #21 | s2115 | h10.5 | 6 | 0 | `bow, hide×19, wood×8` — **identical** |
| #22 | s2197 | h11.8 | 8 | 0 | `bow, hide×19, wood×4` — **identical** |

Respawn refills food to 84–85 and returns the pack byte-for-byte. From `food 0`
to `health ≤ 5` took **9 samples / 2.2 real minutes**. Three deaths in 66 minutes,
one roughly every 22 sim-hours, and it will not stop, because nothing in the loop
learns. The live board right now reads `health 100, food 81` — that is not a
healthy man, that is a man who died nine minutes ago.

### Correction: the thirteenth entry watched a death and did not see it

The 04:33 entry covered samples 1997–2107 and reported the scripted seat "walks,
hunts and shelters through six plausible goals." **Death #20 happened at s2043,
inside that window.** The entry counted goal transitions and missed the corpse,
because `health` was 100 again by the next sample. This is the fifth time the
board's self-healing display has hidden an event from an analysis of it.

### Correction: 45 deaths, not 30 — and starvation is the cause of 80%

Whole run, both minds, by the food-jump method (A91):

| | |
|---|---|
| deaths | **45** (Eachann 22, Coinneach 23) |
| `food == 0` in the sample before | **36 / 45 (80%)** |
| pack byte-identical across the death | **35 / 45 (78%)** |
| rate | **0.82 deaths per mind per sim-day** over 27.5 sim-days |

A64 said 20 starvation deaths, A72 said 25, the 08-08 21:xx entry said 30. The
figure is 36 and still climbing. **A72's finding is not "starvation death is
free" — it is that starvation is the world's metronome.** Neither mind has ever
lost anything worth losing by dying, and both die about once a day.

### Coinneach's plan and his goal have disagreed for the whole window

He rewrote his plan at **s2113** — the 24th rewrite of the run:

```
["eat whatever I get", "hunt that deer I saw", "feed the fire"]     82 of 87 samples
```

No trade line, no Eachann. But his `goal` in the same window was **`offer hide to
Eachann for venison` 42 times**, and `go toward Eachann` 52 times among his
intentions. His written plan has not named Eachann since **s1677** — 524 samples
and roughly six sim-days ago. `plan` is durable and self-authored; `goal` is
re-picked every turn from the prompt. Nothing shows a mind its own plan hard
enough for the two to reconcile, so the seat walks toward a man his plan
abandoned six days back.

### He also names the thing blocking him, and the world has no verb for it

Coinneach's most-used `why` strings include **`"starving, ridge blocks shots"`
(103×)** and this window's new line **`"too far to waste arrows"`**. His window
refusals: **203× `too far`, 116× `a tree in the way`** (29 each at 20/19/18/17 m).
He has diagnosed his own problem correctly and has no move that fixes it — no
stalk, no reposition-for-line, no "get clear of the trees". `why` is being used
heavily by both minds (Eachann 167 distinct, Coinneach 64), and it is where all
the sophistication in this run lives.

### Re-checked, unchanged

- **`note`: zero uses, 23rd check.** Both cards `""` across all 2,201 samples.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since s681. It logged none
  of the window's 62 dead `offer` intentions.
- **Trade: zero.** **No `accept` deed exists in 2,201 samples.**
- **Speech is abundant** — 6 utterances never seen before in this window alone,
  including *"One hide. Venison. Now."* and *"rain won't kill me, hunger will"*.
- **Carcasses still work**; the gather → eat chain fired twice more for Coinneach.

### The one-line version

**The scripted brain that takes over a `SPENT` seat can gather wood and light
fires but has no rule that says "eat", so Eachann has now starved to death three
times in sixty-six minutes with nineteen hides on his back — and the board shows
him at full health, because respawn hands everything back and says nothing.**

---

## 2026-08-09 05:34 PDT — RUN 2, FIFTEENTH LOOK: the buyer paid, the seller ate the goods, and the economy has been dead for three hours

Samples 2201–2287 are only 29 real minutes and hold nothing new (Eachann is
`SPENT` from s1997 and produced **zero** new utterances; Coinneach added three
lines, all reruns of the hide-for-venison price). So this entry goes back and
reconstructs **the last transaction this world ever completed** — s1735–s1787,
minute 581, sim-hour 15.7 — from the pack columns, which is the only honest
witness the board has.

### The trade, sample by sample

Both minds were **live models** here. This is not a `SPENT` artefact.

| s | who | evidence |
|---|---|---|
| 1735 | Eachann | says **"one venison one hide"**. Pack: `hide 12, venison_cooked 3, wood 5` — **he really has the goods** |
| 1737 | Coinneach | says **"one hide for one venison, you said"** — accepts |
| 1741 | Coinneach | **pays.** `hide 1 → 0`. Eachann's pack `hide 12 → 13` |
| 1741–48 | Coinneach | pays again: `wood 141 → 100`, **41 branches**, ≥36 one-unit `give` calls. Eachann's `wood 5 → 30` |
| 1742 | Coinneach | **"here. now the venison"** |
| 1754–87 | Eachann | *"one hide, one venison" · "here, one venison" · "fair trade, hand it over" · "one hide, hand it over" · "fine, one hide" · "one hide then"* — **eleven utterances over 33 samples / 11 real minutes**, demanding a price already in his pack |
| 1760 | Eachann | deed **"I ate a cooked meal"**, `food 45 → 100`, `venison_cooked` gone from his pack. **He ate the meat he had been paid for** |
| 1768 | Coinneach | **"Eachann, quiet. I have no hide."** — true, and it reads as refusal |

The buyer paid in full and overpaid by 41 branches. The payment **landed** —
Eachann's own pack proves receipt on the same sample. He then ate the goods and
spent eleven minutes haggling for money he was already holding.

### This is not "he sold what he didn't have"

The 11:10 entry (twelfth look) found a frozen board holding *"a deal for meat
that never existed."* **That framing does not fit this transaction and I am
correcting the general claim, not that entry's specific window.** Here the meat
existed, the hide existed, both changed hands, and the deal still failed. The
defect is one layer down: **`give` transfers goods and issues no receipt.**
Nothing appears in the recipient's prompt, `deeds`, or `why` to say *a hide
arrived from Coinneach.* A seller cannot distinguish "paid" from "stalling", so
he re-demands; the buyer, now empty-handed, truthfully denies having the item;
and the exchange reads to both as bad faith. Pairs with A0 (minds lose each
other) — they can also lose a payment made to their face.

### The whole-run transfer ledger, and the date of death

Deduped across all 2,287 samples, gives cluster into **five bursts and nothing
else**:

| burst | min | who | what moved |
|---|---|---|---|
| s319–332 | 106 | Eachann | hide ×5, arrow ×5, gold ×1 |
| s400–404 | 133 | Eachann | **venison_cooked ×3**, wood ×9, hide ×3, arrow ×2, gold ×1 |
| s1198–1251 | 399 | Eachann | arrow ×12, wood ×17 |
| s1459 | 487 | Eachann | wood ×1 |
| s1741–1748 | 581 | Coinneach | **hide ×1, wood ×36** |

**Since s1748 — 539 samples, 3 real hours, ~6.5 sim-days — not one item has
moved between them.** Eachann did not go `SPENT` until s1997, so trade stopped
**84 minutes before** the scripted brain took over. The `SPENT` seat is not the
cause of death; the failed transaction is.

And in 13.6 hours of play, **food crossed between these two minds exactly three
times**, all at minute 133. Coinneach has been negotiating for meat ever since
and has received none. At s1800, an hour after paying, he was `food 0, hp 69`,
carrying **167 branches**.

### Correction: the `give` counts

The 08-08 entry said *"59 gives, still all Eachann"*, later corrected to
*"Coinneach gave 7."* Both are now stale: **Coinneach has given at least 37
times** (36 of them wood, in that single burst). Eachann remains at 59.
`deeds` holds only the last five per card, so every give figure in this file is
a floor, never a total.

### Re-checked, unchanged

- **`note`: zero uses, 24th check.** `""` on both cards, all 2,287 samples.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since s681. It logged none
  of the ~33 dead `offer` intentions.
- **`accept` is NOT unused — my own earlier reading of `analyse.mjs` was wrong.**
  The analyser greps the literal string `accept`, but an accept renders as
  **`take <name> offer`**, of which there are **18** (Eachann 11, Coinneach 7).
  Minds *do* reach for accept. It has still produced **zero deeds, whole run.**
- **`plan` durability differs by model, sharply:** Eachann rewrote his plan **5
  times in 11 hours**; Coinneach **24+ times**. Same field, same prompt.
- **kimi-k2.6's failure rate has never improved:** 52% → 50% → 53% → 51% → 44%
  → 43% → 44% across the run. **200 of 456 calls, all `no json in reply`.**
  Roughly half of everything Coinneach has ever done was the script.

### The one-line version

**The last trade in this world completed and still failed: Coinneach handed over
a hide and forty-one branches, Eachann's pack recorded every unit of it, Eachann
ate the venison, and then spent eleven minutes saying "one hide, hand it over" —
because `give` moves goods and tells the recipient nothing, and the economy has
not moved an item since.**

---

## 2026-08-09 06:05 PDT — RUN 2, SIXTEENTH LOOK: both minds are now on a death metronome, and one of them is a live model

Board answers; sampler live at s2372, 792 real minutes, sim-hour 17.6. Window is
**s2233–2372** (140 samples, ~47 real minutes). Eachann is `SPENT` — **red tag,
his behaviour has not been the model's since s1997.** Coinneach is
`spent: false`, still calling, still a real kimi-k2.6.

### The finding: four deaths in this window, two of them the live model's

| who | brain | died at | and again at |
|---|---|---|---|
| Eachann | **scripted (`SPENT`)** | s2277 (hp 7 → 100/85) | s2367 (hp 5 → 100/85) |
| Coinneach | **kimi-k2.6, live** | s2284 (hp 4 → 100/84) | s2356 (hp 4 → 100/85) |

Both are on a fixed cycle: food drains ~1/sample from 85 to 0 over ~80 samples,
then health falls ~11/sample for 8 samples, then respawn refunds food and health
and the pack comes through byte-identical. Eachann's period is **90 samples**
(s2278→s2368), Coinneach's **72** (s2285→s2357). Whole run by the food-jump
method: **Eachann 18 deaths, Coinneach 24.**

### This corrects A101's scope, and it matters

The 05:06 entry concluded *"the scripted fallback brain has no `eat` rule."* That
is true and still worth fixing — but **it is not why this world is starving.**
The live model dies on the same clock, from the same cause, with the same empty
pack. Across all 140 samples:

- **Neither mind held a single food item at any point.** Eachann: `bow, hide 19,
  wood n, arrow n`. Coinneach: `bow, hide 3, wood n`. No venison, no meat, ever.
- **Zero kills.** Eachann frozen at **17**, Coinneach at **7**, for the whole window.
- **Eachann loosed ~26 arrows and hit nothing** (`astray` 99 → 125), ran his
  quiver to zero at s2299, and has had **an empty quiver for 73 samples** — ~24
  real minutes, ~22 sim-hours — while his `goal` read **`"hunt a deer"`** in
  roughly forty of them.
- **Coinneach has not loosed one arrow in 140 samples** and has had no `arrow`
  line in his pack the entire time.

The chain is: no arrows → no kills → no meat → starve → respawn at food 85 →
repeat. The script and the model fail at it *identically*. The only difference
between them is that one still talks.

And Coinneach's `plan` has read the same three items, unchanged, all window:

```
["eat what I get", "find arrows", "feed the fire"]
```

**He has named his own binding constraint — `find arrows` — and starved to death
twice while it sat at the top of his plan.** He crafts (26 craft deeds run-total)
and he cannot craft arrows without a fire and wood he does not have; he carries
one branch.

### `loosed` is a ring buffer, not a counter — A85 is now solved at the source

A85 has been open at †††† since 08-08: *`astray` exceeds `loosed` on every card,
the hit rate is uncomputable.* The mechanism is now proven twice over.

**From the data.** Across all 2,372 samples, `astray` **never decreases once**
for either mind — 0 sample-steps. `loosed` decreases on 8 steps each, always in
monotone runs that end at zero:

```
Eachann    s2286: 85→58   s2287: 58→33   s2288: 33→7   s2289: 7→0
           s1298: 39→25   s1299: 25→23   s1300: 23→0
Coinneach  s2152: 274→256  s2162: 256→255  s2164: 255→248 …  s423: 36→0
```

**From the source.** [agent.js:786](src/net/agent.js:786) trims `releases` to a
ring buffer of `AGENTS.logSize` = **400** ([config.js:1025](src/config.js:1025)).
`this.shots` ([agent.js:652](src/net/agent.js:652)) is pushed and **never
trimmed**. So `astray = shots.length` is cumulative forever, while
`loosed = releases.filter(r => r.loosed).length` counts only the last 400
releases — and a bow that keeps *refusing* (`"ground in the way"`,
`"a tree in the way"`) pushes non-loosed releases that evict the loosed ones. At
s2286–2289 about 85 loosed entries were flushed out in eighty seconds.

`loosed` is not "the honest denominator" [board.js:190](server/board.js:190)
claims it is — it is a rolling window of the last 400 bowstring events. **Every
accuracy figure in this file taken from these two fields is void**, which is what
A85 warned and this now explains.

### The budget the run cannot reach

`spend: 1972 calls of 6000`. Eachann sits at `calls 1500, ofMaxCalls 1500` and
cannot make another. Coinneach is at 472 on a 75 s cadence with a 44% failure
rate. **4,028 calls — 67% of the run budget — are stranded behind a per-seat cap
on a seat that has been a script for two and a half hours.** Extends A95.

### Re-checked, unchanged

- **`note`: zero uses, 25th check.** `""` on both cards, all 2,372 samples.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since s681. Coinneach spent
  ~20 samples on `goal: "offer hide to Eachann for share"` in this window and it
  produced **no deed and no `refusedVerbs` entry** — A107's exact shape again.
- **Trade: zero.** No `give`, `offer` or `accept` deed anywhere in 140 samples.
  Nothing has moved between them since s1748 — now **624 samples, 3.5 real hours.**
- **Speech: 5 new lines, all Coinneach**, all the same offer —
  *"starving. one hide, one share. now." · "One hide, one share. I'm cold." ·
  "Eachann. Hide for a share. Cold."* Eachann produced **zero** new utterances;
  the `SPENT` script has no `say`. He has been bargaining with a corpse-in-waiting
  that cannot answer, and he does not know it (A94/A97).
- **Fires: 8 lit in the window** (s2250, 2252, 2271, 2299, 2320, 2327, 2332,
  2350). The 10-branch price is visible in the pack — Eachann's wood ran to **75**
  and dropped to 21 when he lit and crafted — but he re-gathered 75 branches in
  about eleven sim-hours, so the price is real and still not scarce. A100 holds.
- **A quantity caution:** at s2271 the deed reads *"I made 8 arrows at the fire"*
  while the pack went `arrow 5 → 17` and `wood 59 → 21`. `deeds` holds only the
  last five, so this is most likely two crafts inside one 20 s sample — but it is
  another reminder that **a deed line is not a quantity.**

### The one-line version

**Both minds are now dying on a metronome — Eachann every 30 real minutes, the
live kimi seat every 24 — and it is not the scripted brain's missing `eat` rule,
because neither mind has held a scrap of food or made a kill in forty-seven
minutes: they have no arrows, and Coinneach has "find arrows" written at the top
of the plan he starved to death under, twice.**

## 2026-08-09 06:35 PDT — RUN 2, SEVENTEENTH LOOK: 44% of the "live" seat is the scripted brain, and the board says `fellBack: false`

Board answers. Sampler at **s2462**, `at 36797`, sim-hour 21.6, 819 real minutes.
Window is **s2372–s2462** (90 samples, ~30 real minutes, sim h17.9 → 21.6).
Eachann `SPENT` since s1997 — **red tag, not the model.** Coinneach
`spent: false`, 490 calls, **213 failures**.

### The finding: `spent: false` does not mean "the model decided this"

Coinneach's failure rate is **213/490 = 43.5%**, every one `no json in reply`
(kimi-k2.6 answering in prose). [providers.js:381–400](src/minds/providers.js:381)
sends every throw to `return this.fallback.decide(brief)`. So nearly half of that
seat's ticks are the scripted brain wearing kimi's name — and there is **no tag,
no counter, and no event** that says which ticks those were.

There is one accidental tell, and it is perfect:

| | failure-steps | `why == null` | scripted goal |
|---|---|---|---|
| Coinneach | 214 | **214 (100%)** | 209 (98%) |
| *(non-failure steps)* | 2250 | 816 (36%) | 1457 (65%) |

`why` is null on **every single** fallback tick and on only 36% of real ones,
because `ScriptedProvider` writes no reason. You can watch it happen live at the
end of this window — three failures, three scripted goals, three null `why`s:

```
s2451 fail=211  take Eachann offer            why=taking venison for hide
s2452 fail=212  walk the country…             why=-      ← fallback
s2457 fail=213  hunt a deer                   why=-      ← fallback
s2462 fail=214  find shelter and settle…      why=-      ← fallback
```

And [board.js:152](server/board.js:152) defines the flag that was supposed to
catch this as `fellBack: calls >= 3 && answered === 0` — a run-level *"this seat
never answered at all"* test. **A seat that falls back on four ticks in nine can
never trip it.** This is A42 confirmed with the mechanism and the number, and it
means every behavioural claim about kimi-k2.6 in this file is diluted by ~44%
script. The `SPENT` tag is not sufficient; a seat can be a script for half its
life with no mark on it whatsoever.

### `take Eachann offer` — 53 samples, zero deeds, and he died holding it

s2399–s2451: **53 consecutive samples, ~18 real minutes, ~16 sim-hours**, one
goal. In that stretch Coinneach produced **not one deed**. His food went 39 → 0,
health 100 → 3, he **starved to death at s2443** — and came back and held the
same goal for eight more samples (`why: "taking venison for hide"`).

`refusedVerbs` stayed `{}` throughout. The column the fix-list calls the single
most informative one **did not fire once**, and now I know why at the source:
[agent.js:2562](src/net/agent.js:2562) `case 'accept'` calls `refuse('accept', …)`
**only when the named person cannot be found** — and `anyone()` searches the
unculled snapshot, so Eachann is *always* findable. The verb resolves, returns a
walk-to-him, and fails silently at the far end. **`refusedVerbs` is structurally
blind to the failure mode that is actually killing this world.** That is A107's
mechanism, located.

The good he is buying does not exist. Eachann's last food item was at **s1873**
— 589 samples, ~3.3 real hours ago. His pack all window: `bow, hide 19, wood 12→13`.

### The counterparty is a cached string

Eachann, `SPENT`, 90 samples: **35 deeds, all `gather` (28) and `place` (7).**
Zero speech, zero new goals, `why` null 90/90. His `plan` still reads

```
["get meat", "trade with Coinneach"]
```

— frozen at the instant he went `SPENT`, 465 samples ago, and the board renders
it exactly like a live intention. Coinneach has spent thirty minutes negotiating
against it.

### Re-checked

- **Trade: still zero.** No `give`/`offer`/`accept` deed for either mind in 90
  samples. Nothing has moved between them since s1748 — **714 samples, ~4 hours.**
- **`note`: `""` on both cards, 26th consecutive check.** Zero uses, whole run.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since s681.
- **Speech: 5 new lines, all Coinneach**, all the same trade — *"One hide, one
  share. We trade now." · "Done. One hide." · "Give me the venison. You have your
  hide."* Eachann: **0**, as expected of the script.
- **Fires: 7 in the window** (all Eachann). At `SURVIVAL.woodToLight = 10`
  ([config.js:1698](src/config.js:1698)) that is 70 branches, and he gathered
  ~200 in the same 90 samples with his pack net-moving `wood 12 → 13`. **A100
  holds: the 10-branch price is a treadmill, not scarcity.**
- **Deaths: 2** — Coinneach s2443 (hp 3→100), Eachann s2453 (hp 7→100). The
  metronome from the last entry continues.
- **`why` is the one self-authored field that works.** 16 distinct lines from
  Coinneach this window, tracking one constraint honestly all the way down:
  *"no food and he has meat"* → *"no food left"* → *"hungry, need the venison"*
  → *"starving, we agreed hide for meat"* → *"starving, he agreed"*.
- **One branch short.** Coinneach has held exactly **9 wood since s2378** — 84
  samples — against a 10-branch fire, with `"feed the fire"` on his plan. He
  stopped gathering at 9 and never learned he was one short.

### The one-line version

**The live seat is not reliably live — 44% of Coinneach's ticks are the scripted
brain with no tag on the board, the only tell being that `why` goes null — and in
the ticks that *were* his, kimi-k2.6 held `take Eachann offer` for 53 samples,
produced no deed, registered no refusal, and starved to death buying venison from
a script that has never carried food.**

## 2026-08-09 07:05 PDT — RUN 2, EIGHTEENTH LOOK: they both starved with the fletching gate shut, and the gate is arithmetic

Board answers. Sampler at **s2555**, `at 38156`, sim-hour 2.3, 851 real minutes.
Window is **s2462–s2555** (94 samples, ~31 real minutes, sim h21.3 → h2.3).
Eachann `SPENT` since s1997 — **red tag; those 94 samples are the script, not
grok.** Coinneach `spent: false`, 508 calls, **222 failures (43.7%)** — and 9 of
his 18 calls *in this window* failed, so read him as ~half script too (A112).

### The finding: `spareWood` (14) > `woodToLight` (10) > a felled tree (8)

Both minds starved to death five samples apart — **Coinneach s2522** (hp 6→100,
food 0→85) and **Eachann s2527** (hp 0→100, food 0→84) — each holding
`goal: "stay still and watch"`. In the whole window their deeds are
**51 gathers and 17 fires and nothing else**: no `eat`, no `killed`, no `craft`.
They gathered and burned wood for half an hour and neither ate once.

They could not eat because they could not shoot, and they could not shoot
because of one comparison. [agent.js:1359](src/net/agent.js:1359):

```js
this.count('arrow') < AGENTS.lowArrows &&      // 0 < 5   — open all window
this.count('wood')  >= AGENTS.spareWood        // wood >= 14 — the wall
```

Measured over the 94 samples:

| | wood ≥ 14 (gate open) | zero arrows | max wood held |
|---|---|---|---|
| Eachann | **2 / 94 (2%)** | 94 / 94 (100%) | 17 |
| Coinneach | **0 / 94 (0%)** | 94 / 94 (100%) | 13 |

The three numbers cannot be satisfied together. A felled tree gives **8**
([config.js:1151](src/config.js:1151), raised so "one tree is one fire"),
lighting costs **10**, fletching needs **15**. So: two trees (16) opens the gate
— but a cold body lights first, drops to 6, and is two trees away from an arrow
again. Every one of the 17 fires in this window knocked its owner back under the
gate. **The fire and the quiver draw on the same pool, cold is immediate and
hunger is slow, so the fire always wins and then they starve.**

This is A108's arrow famine with its mechanism attached, and it is not a model
failure — the seat that starved hardest was a script, and it is arithmetic.

### It is a late-run condition, not a constant

Binned across the run, the gate-open share swings hugely and then shuts:

```
s0–250    E 49%  C 34%        s1500–1750  E 42%  C 91%
s500–750  E  1%  C  0%        s2000–2250  E 11%  C  0%
s1000–1250 E 84%  C 72%       s2500–end   E  0%  C  0%   ← both die here
```

Peak packs were **154** and **178** branches. So wood is not globally scarce;
availability is spiky (`regrowHours` 30) and the deaths land in the trough.
Note also that **Coinneach's gate is at or near 0% in seven of eleven bins** —
he has been chronically unable to fletch for most of the run, which is the real
reason his shooting numbers are what they are.

### Correcting A114

A114 said Coinneach "gathered to 9, stopped, and was never told he was one
branch short." **The first half holds and the second is wrong.** The 9-wood
plateau ran s2378→~s2477 (~99 samples) and then he *did* break it — wood 9 → 13
at s2480 — and lit **9 fires** in this window. He was not permanently stuck at 9.
The partial-progress message A114 asks for is still worth having, but it should
be argued as ergonomics, not as the thing that trapped him.

### `plan` outlives its author

Coinneach's plan read `["eat what I get", "find arrows", "feed the fire"]` for
**93 of 94 samples** — through zero wood, zero arrows, zero food, **through his
own death at s2522**, and through 33 samples of respawned life after it. It was
never reconciled with the fact that two of its three items had become impossible.
At the very last sample (s2555) he rewrote it to
`["gather wood", "trade hide to Eachann for meat", "make arrows"]` with
`why: "zero branches, shivering, need fire and shafts"` — and wood went 0 → 6 on
the next tick. That is the first plan-rewrite-then-act I have seen, but it is
**one sample; too early to call.** Note he only wrote *"make arrows"* after
dying — for the whole preceding stretch his plan said *"find arrows"*, a scavenge
he cannot control, while the fire he was standing at could have fletched them.

### Re-checked

- **Trade: still zero.** No `give`/`offer`/`accept` deed for either mind. Nothing
  has moved between them since s1748 — **807 samples, ~4.5 real hours.**
- **`note`: `""` on both cards, 27th consecutive check.** Zero uses, whole run.
- **`refusedVerbs`: `{"avoid": 16}` / `{}`.** Unmoved since s681. Coinneach spent
  20 samples on `offer hide to Eachann for share` (s2532–s2548) with no deed and
  no entry — A113's shape, again.
- **Speech: 6 lines, all Coinneach** — *"One hide. One share. Done." · "A hide
  for meat. Done." · "Give me the venison. You have your hide." · "camp here,
  fire and sleep" · "fetching wood"*. Eachann: **0**; the `SPENT` script has no
  `say`, and his card still displays the frozen `"one hide for your venison?
  done"` as if it were live (A94/A97).
- **`why` remains the one self-authored field that works** — 10 distinct honest
  lines tracking the real constraint: *"no food"* → *"need to eat"* → *"got no
  food and winter's here"* → *"dark and no arrows"* → *"zero branches,
  shivering, need fire and shafts"*. He named his own death correctly and had no
  verb that answered it.
- **Budget: 2007 of 6000 calls.** 3,993 stranded behind the per-seat cap (A111).

### The one-line version

**Both minds starved to death within ninety seconds of each other while gathering
51 times and lighting 17 fires, because fletching needs 15 branches, a fire costs
10 and a tree gives 8 — so every fire they lit to survive the night put an arrow
further out of reach, and the gate that lets a body make arrows was open for 2 of
94 samples on one seat and 0 of 94 on the other.**

## 2026-08-09 07:35 PDT — RUN 2, NINETEENTH LOOK: `refusedVerbs` is dead instrumentation, and a live mind starved to death working a trade errand at 11 hp a tick

Board answers. Sampler at **s2648**, `at 39528`, sim-hour 6.9, 883 real minutes.
Window is **s2554–s2648** (95 samples, 31.3 real minutes, sim h2.0 → h6.9).
Eachann `SPENT` since s1997 — **red tag; all 95 samples are the script, not
grok.** Coinneach `spent: false`, 525 calls, **230 failures (43.8%)** — 8 of his
17 calls *in this window* failed, so ~half of his seat is script too (A112).

### The finding: the most informative column on the board has recorded one word all run

`refusedVerbs` across **all 2,648 samples, both minds**, has only ever held these
values:

```
Eachann {}  →  {"avoid":2}  →  {"avoid":8}  →  {"avoid":13}  →  {"avoid":16}
Coinneach {}                                          ← never anything else
```

One verb, one seat, **frozen at 16 since s681** — 1,967 samples ago. Meanwhile
in this window Coinneach held `goal: "offer hide to Eachann for venison"` for
**seven consecutive samples** (s2594–s2600) with `why: "starving, his price is
known"`, **while actually carrying `hide x3`** — and it produced no `give` deed,
no trade, and **no `refusedVerbs` entry**. The verb was reached for and vanished.

The deed vocabulary for the whole run confirms there is nowhere for it to land:

```
killed 398 · gather 13407 · place 8851 · craft 1678 · eat 836 · give 1076
```

There is **no `offer` deed, no `accept` deed, no `refused` deed, no `died` deed**
anywhere in 2,648 samples. `give` works (1,076 — all before s1748). `offer` has
never once produced an observable event of any kind. So the 2026-08-08 fix
("a verb reached for and refused now looks different from one nobody wants")
**does not cover `offer`, which is the verb the minds actually reach for.**

**I was wrong in my first pass at this window** and am recording it: I read
Coinneach as offering a hide he did not own. He owned it — `hide x3` on every
one of those seven samples, and he has carried a hide in 1,483 samples of 2,645.
The offer failed for the harness's reasons, not his.

### Both minds starved, and the board watched it happen in 11-point steps

Food hit 0 at s2590/s2591 and health drained at an exact **11 hp per sample**:

```
Eachann   100 → 89 → 78 → 67 → 56 → 45 → 34 → 23 → 12 → 1 → dead (s2601)
Coinneach  81 → 70 → 59 → 48 → 37 → 26 → 15 →  4 → dead (s2598)
```

Ten samples is **200 real seconds**. At Coinneach's 75 s cadence that is **under
three decisions** between full health and death — and he spent them well: at
hp 37, 26, 15 and 4 his goal was `offer hide to Eachann for venison`, and he
closed ~200 m of ground toward Eachann across the errand (351 → 241 → 169 →
150 m). **He correctly identified the one action that would feed him, walked
toward it while bleeding out, and the counterparty was a script that has never
executed `accept`.** He abandoned the errand at s2601 — the sample Eachann
respawned 340 m away.

Eachann's goal while dropping 45 → 1 was `"stay still and watch"`. **That is the
script, not grok** (A101/A112): `why == null` on **647 of the 648 samples since
he went SPENT**. The fallback brain still has no eat rule and no low-health rule.

### Two deaths, two different rulebooks, and the mind is told about neither

- **s2598, starvation:** pack untouched — `hide x3, wood x9` before and after.
- **s2629, violence:** hp **100 → 0 in one sample** on food 55, and the pack was
  **stripped to the bow** (`hide x3, wood x11` → gone). He had said
  *"goblins too close east, I'll sleep at the scaur"* and then walked to the
  scaur. Two samples later his goal is `make for Scaur of Fair`,
  `why: "shelter for the night"`, as though nothing happened.

No deed anywhere in the run matches `/die|dead|lost|hurt|wound/`. A mind cannot
see that it died, what killed it, or that 3 hides and 11 branches left its back.
This is the loot-drop asymmetry from e86de3e with its trigger identified:
**only the violent death runs the drop path.**

### Settling A116's open question — the plan rewrite did not lead anywhere

The last entry flagged Coinneach's s2555 rewrite to `["gather wood", "trade hide
to Eachann for meat", "make arrows"]` as "the first plan-rewrite-then-act; one
sample, too early to call." **Called: it did not act.** Over the following 70
samples he gathered **118 branches**, lit **5 fires**, made **zero arrows**,
never got wood above **11**, and at s2625 rewrote it again to `["trade Eachann a
hide for meat at dawn", "fletch arrows from the branches", "hunt those east deer
after"]` — still zero arrows. The plan is honest and the gate is shut (A115).

### Re-checked

- **Fletching gate (A115) holds, harder.** Open **1/95** for Eachann, **0/95**
  for Coinneach. **Zero arrows on both, 95/95.** They gathered **216 branches**
  between them in 31 minutes and lit 10 fires; max wood held was 14 and 11.
- **Deeds in window: 28 gathers and 10 fires and nothing else.** No `eat`, no
  `killed`, no `craft`, no `give`, for both minds, for 31 minutes.
- **Trade: still zero.** Nothing has moved between them since **s1748** — now
  **900 samples, ~5 real hours.**
- **`note`: `""` on both, 28th consecutive check.** Zero uses, whole run.
- **Speech: 5 lines, all Coinneach** — *"I'll freeze without wood to burn" ·
  "fetching wood" · "One hide. Your venison." · "One hide. One share. Done." ·
  "goblins too close east, I'll sleep at the scaur"*. Three of the five are
  narration to nobody. Eachann: **0 live**; his card still displays the frozen
  `"one hide for your venison? done"` from before s1997 (A94/A97).
- **`why` is still the one self-authored field that works** — 10 distinct lines,
  every one accurate: *"need ten branches before I freeze"* · *"need two more
  branches for fire"* · *"dark and no arrows"* · *"starving, his price is known"*.
- **Budget: 2,026 of 6,000 calls.** 3,974 stranded behind the per-seat cap (A111).

### The one-line version

**`refusedVerbs` has held exactly one word — `avoid: 16` on one seat — for 1,967
samples, while a starving mind spent seven ticks and 200 m of ground offering a
hide he really had to a seat that has never executed `accept`, and died at 11 hp
a tick with the offer still on his card and nothing anywhere recording that it
was refused, that he died, or that the deal was never possible.**

---

## 2026-08-09 08:07 PDT — RUN 2, TWENTIETH LOOK: both minds starved to zero in the same window, and the live one wrote *"fire is set, need sleep before dawn"* at food 2

Window **s2630 → s2743**, 112 samples, **37 real minutes**. Run still live at
s2747. Budget **2,046 of 6,000**. Eachann `spent: true` since s1997 — **half this
world has not been a model for 750 samples** (A97/A112). Coinneach `spent: false`,
546 calls, **249 failures (45.6%)**, every one `no json in reply`.

### The finding: the night routine outranks starvation, and the mind's own `why` proves it

Coinneach is the **live** seat. His food ran **84 → 0** across the window and he
then rode the 11-point ladder **92 → 81 → 70 → 59 → 48 → 37 → 26 → 15**. His
`goal` on **every single sample of that descent** was `find shelter and settle
for the night`. The two `why` lines he authored on the way down, verbatim:

```
s2706  food 7  hp 100   why: "night is here, fire burns"
s2711  food 2  hp 100   why: "fire is set, need sleep before dawn"
```

**Both are correct reasoning about the fire. Neither mentions food.** This is not
a model failing to notice hunger — it is a model correctly prioritising the thing
its card presents as the salient fact. Nightfall is announced; food 2 is a number
in a row. He committed to the night goal and **held it for 20 consecutive
samples** while starving. A118 asked for a warning at food 0; this shows the
warning has to land *before* the mind commits to the night, because once
committed it never re-ranked.

### The whole output of both minds, for 37 minutes

| | gathers | fires | eat | kill | craft | give |
|---|---|---|---|---|---|---|
| Eachann | 11 (all wood) | 3 | 0 | 0 | 0 | 0 |
| Coinneach | 27 (all wood) | 5 | 0 | 0 | 0 | 0 |

**38 branches picked up, 8 fires lit, and nothing else happened.** 8 fires =
**80 branches burned**; deeds done *"at the fire"*: **0**. With the nineteenth
look's 28 gathers and 10 fires, that is now **68 real minutes and 207 samples of
gather-and-burn with zero food, zero arrows, zero kills and zero trade.** A115's
fletching gate, measured at run scale: the fire is a **pure sink** in this
regime — it consumes the only good either mind can reliably produce and returns
nothing. (Deeds are a 5-deep rolling list sampled every 20 s, so these are floors.)

### Eachann died carrying nineteen hides

His ladder: s2673 food 0, then **89 → 78 → 67 → 56 → 45 → 34 → 23 → 12 → 1**,
respawn at s2683. `carrying: bow x1, hide x19, wood x3` on **every sample of it,
including hp 1**. Goal on the ladder: `stay still and watch`, `why: null` on
**112/112** — the script (A101/A112). As of s2747 he is at **food 0 again**,
starting a second ladder, still holding **hide x19**.

### Coinneach's plan is impossible three separate ways

Unchanged all window: `["trade Eachann a hide for meat at dawn", "fletch arrows
from the branches", "hunt those east deer after"]`. He plans to trade **a hide he
does not have** (`carrying: bow x1, wood x6`) for **meat that does not exist**
(Eachann: 0 kills in window, no meat in pack) to **a counterparty that is a
script** (A107/A117). The plan is honest, durable, and unreachable — A116 again,
now with all three legs falsifiable from one card.

### Re-checked

- **`note`: `""` on both, 29th consecutive check.** Zero uses, whole run.
- **`refusedVerbs` frozen** at `{avoid: 16}` / `{}` — now **2,079 samples**, one word.
- **Trade: zero.** Nothing has moved between them since **s1748** — ~1,000
  samples, ~5.5 real hours.
- **Speech: 5 lines total, all Coinneach**, unchanged from the nineteenth look.
  Eachann's card still displays the frozen `"one hide for your venison? done"`
  from before s1997.
- **`why` remains the one self-authored field that works** — and this window is
  the clearest case yet that it is *diagnostic*: it told us exactly why he starved.

### The one-line version

**A live model wrote *"fire is set, need sleep before dawn"* at food 2, held
`find shelter and settle for the night` for twenty samples while its health fell
100 → 15, and was right about the fire every step of the way — because nothing on
the card ever told it that hunger now outranked nightfall.**

---

## 2026-08-09 08:35 PDT — RUN 2, TWENTY-FIRST LOOK: the trade system can only move **one item**, and neither mind has ever negotiated a price that was not a **quantity**

Run live at **s2822**, board `at 42428`, game **day ~37, hour 13.7**, ~940 real
minutes. Budget **2,064 of 6,000**. Eachann `spent: true` since **s1997**
(`at 30013`, game h22.5) — **29% of all samples are the script, not the model**.
Coinneach live: **564 calls, 261 failures (46%)**, every one `no json in reply`.

### The finding, traced from the log into the source and back

I have been recording "trade: zero" for twenty looks. That is wrong in an
important way. **Trade happened — 96 times — and every instance moved exactly one
object.** The full-run deed counts, deduped:

| | give deeds | shape |
|---|---|---|
| Eachann | **59** | 11 bursts: `arrow ×8`, `venison_cooked ×18`, `wood ×9`, `hide ×3` … |
| Coinneach | **37** | **one unbroken burst — 37 single hides, h15.64 → h17.80** |

The `h` stamps are **0.05 apart, every one of them.** One item, one tick.
Coinneach's entire trading career in 37 game days is **2.16 game hours spent
handing over one pile of hides one hide at a time.** Eachann paid 18 cooked
venison the same way across a full game hour.

Now what they were actually agreeing, verbatim, from the same run:

```
Eachann    "nine branches now or no arrows"
Coinneach  "Done. Nine branches for the arrows."
Eachann    "seventy-four branches? I'll give you some meat for fifty"
Coinneach  "Fifty branches. Give me the meat."
Coinneach  "six arrows, nine branches. I'll take it."
```

**Every price either mind has ever named is a quantity. The economy cannot
express one.** Three places, all confirmed:

- `src/minds/goals.js:141` — `give.params: ['target', 'item']`. **No count.**
  `offer.params: ['target', 'item', 'want']` (`:132`). **No count on either side.**
- `src/net/agent.js:2534` — the agent's give builds
  `actAlso: { giveItem: g.item ?? '' }` and **never sets `giveCount`**, so
  `src/sim/world.js:1234`'s `intent.giveCount || 1` resolves to **1, always**.
- `resolveGive` **already supports 1–99** and its own comment names this exact
  case: *"A player settling 'nine branches for the arrows' sends nine."* It was
  built for the human playtester and **never wired to the agent path.**
- `resolveAccept` (`world.js:825-831`) hardcodes `remove(deal.item, 1)` and
  `remove(deal.want, 1)`. Even a working accept is **1-for-1, permanently.**

So: the minds negotiated competently, in numbers, in plain speech, and then had
to pay in a currency of one — 50 branches is 50 ticks, and starvation, nightfall
and death interrupted every long payment. **This was the instrument, not the
models.** Sixth time.

### Correction: `accept` was not "never used" — it was chosen constantly and failed in silence

Earlier entries and the analyser record `accept` under *"what nobody ever did"*.
That reads off deeds. `accept.describe` renders as **`take <name> offer`**, and
that string appears in **1,459 intention-samples**. The models pick it. It
produces **zero deeds and zero refusals** because `resolveAccept` has **six bare
`return`s** — dead giver, no `deal`, wrong target, out of range, giver short,
taker short — and the offer docs call this *"silent by design"*. `offer` is the
same: **1,821 intention-samples, 38 distinct offers, zero deeds, zero refusals.**

### `refusedVerbs` — the brief's "single most informative column" — logged **two words** in 2,822 samples

- Eachann: `{avoid: 16}` for **2,141 samples**, then **reset to `{}`** on death for 678.
- Coinneach: `{}` for 2,776 samples, `{hunt: 2}` for 46.

**Never `offer`, never `accept`, never `give`.** The verbs that fail 3,280
intention-samples running are precisely the ones it does not record, because
their failure path never calls `refuse()`. It also **zeroes on death**, so it
cannot accumulate. As instrumented it is not the most informative column; it is
close to inert.

### What the 2026-08-08 fixes actually did — honestly

- **Speech: this one worked, and the brief's premise is out of date.** Not one
  sentence. **~180 distinct lines from Eachann, ~125 from Coinneach**, and it is
  real bilateral haggling with price movement — Eachann opens *"Coinneach, one
  hide for two venison?"* and closes at *"one hide one share"*. This is the best
  thing in the run.
- **Carcasses: worked.** `gather venison` fires — Eachann **33 venison**,
  Coinneach **12 venison + 5 venison_cooked**.
- **`plan`: used and durable** — Coinneach **27 distinct plans**, Eachann 5
  (frozen since he went spent). It is written honestly and, per A116, still not
  acted on.
- **`note`: `""` on both, 2,822/2,822. 30th consecutive check.** Dead field.
- **Fire cost at 10 branches: did not create scarcity.** **268 fires = 2,680
  branches, against 20,904 gathered — 12.8%.** Peak wood held was **154**
  (Eachann, h0.9) and **178** (Coinneach, h4.6).
- **`also out there`:** still unanswerable from the board — it exposes no contacts.

### Correcting A115 (the fletching gate)

A115 measured max wood 14 and 11 and read a standing wood shortage. At run scale
that is wrong: wood peaks at **154/178** and they gather 20,904 branches. The
gate is real **inside the death-loop regime** — **52 respawns** (25 + 27) across
37 game days, and death is where the pack goes — but it is not a property of the
world's wood supply. The shortage is a *death* symptom.

### The window (last 80 samples, `at 40949 → 42466`, h12.4 → 12.7)

Coinneach walked to Eachann **three separate times**, saying:

```
"Eachann. I'm starved. What's your price for a share?"   why: "need venison, will pay or owe"
"What for a share? I have branches."                     why: "he has meat and I do not"
"I need meat, Eachann. I will owe you."                  why: "starving and he has meat"
```

He is bargaining with **a script that went spent 800 samples ago and is carrying
`bow, hide ×19, wood ×4` — no meat at all.** Eachann fell **hp 100 → 6** on food
0 through the window holding those 19 hides; Coinneach went food 62 → 12 at
hp 100. Deeds for the pair in 25 real minutes: **52 gathers, 15 fires, nothing
else.**

### The one-line version

**Both minds can negotiate a price out loud and neither can pay one: `give` and
`accept` move exactly one object per tick, `give`'s existing 1–99 count was built
for the human and never wired to the agent, and `offer`/`accept` fail through six
silent `return`s that `refusedVerbs` — the column meant to catch exactly this —
does not record.**

---

## 2026-08-09 09:03 PDT — RUN 2, TWENTY-SECOND LOOK: **the running server is sixteen hours older than the fixes we have been grading it on**

Board live at `at 43942`. 2,911 samples. `spend 2085/6000`. Window since the last
entry: **89 samples, `at 42485 → 44025`**, h13.1 → 16.1 (a day wraps inside it).

### The finding that changes how the last three entries should be read

Every node process in this run started **2026-08-08 16:51**:

```
Id     StartTime
18024  8/8/2026 4:51:42 PM
20592  8/8/2026 4:51:12 PM
25256  8/8/2026 4:51:13 PM   ...and four more, all 16:51
```

Today's three feature commits landed **sixteen hours later**:

```
25b2cbc  2026-08-09 08:21  feat(give,death): a player can pay, and the ninety-second death loop is closed
e6b48dd  2026-08-09 08:29  feat(torch)
d0dafda  2026-08-09 08:45  feat(drop)
```

**None of them is in the process being sampled.** `duo2.jsonl` is one continuous
16-hour recording of the 16:51 binary. So:

- The one-object-per-tick economy measured at 08:35 (entry 21) is **the old
  `give`** — correct as recorded, but it is *not* evidence that `feat(give,death)`
  failed, and the next entry must not read it that way.
- Nothing in the instrument could have caught this. The board publishes `at`,
  `minds`, `model`, `url`, `spend` — **no build id, no boot time, no commit.**
  I only found it by listing PIDs. That is A126.

**The practical upshot for Ben: the fixes are unjudged. They need a restart, not
another read of this log.**

### Eachann's card is a museum piece, and a live mind spent the window bargaining with it

Exact crossing: last `spent:false` at **`at 29999` (sample 1997, 1,499 calls)**,
first `spent:true` at **`at 30013` (sample 1998, h22.5)`**. That was **913 samples
ago**. Since then the card has displayed, unchanged:

```
plan: ["get meat", "trade with Coinneach"]
said: ["one hide for your venison? done", ...x3]
```

Both are **frozen relics written by grok before it went spent.** The scripted
brain does not write plans or speak; it inherited the strings and the board
renders them as current. Window deeds for Eachann: **22 gathers, 7 fires, and
nothing else** — 0 kills, 0 arrows, 0 gives, carrying `bow, hide ×19` and **no
meat at all**.

Against that, Coinneach (kimi, genuinely live) walked to him **five separate
times in three game hours**, each with a `why` he wrote himself:

```
h6.20   go toward Eachann   why: "need venison, will pay or owe"   "Eachann. I'm starved. What's your price for a share?"
h8.40   go toward Eachann   why: "he has meat and I do not"        "What for a share? I have branches."
h10.88  go toward Eachann   why: "need meat and warmth"            "I need meat, Eachann. I will owe you."
h15.76  go toward Eachann   why: "rather owe than starve"          "starving, need meat, what for it"
h23.88  go toward Eachann   why: "get meat, owe later"             "Eachann, I need meat. I will owe you."
```

`"he has meat and I do not"` is **false, and Coinneach had no way to check it** —
see A128. He went **hp 100 → 11, food 10 → 0** doing this. This is the second
consecutive window in which the live mind starves while working a trade errand
against a script, and the second in which the board's own display invited the
misreading the brief warns about. Say it plainly: **from sample 1998 onward,
nothing Eachann does is grok's.**

### The rest of the window, briefly

- **Both minds, 30 real minutes, combined: 38 gathers, 13 fires. Nothing else.**
  No kills, no gives, no trades, no attacks. Identical in shape to the previous
  window (52 gathers, 15 fires). The world is a wood-gathering loop.
- **Coinneach loosed 248 → 248.** He did not draw once in three game hours while
  starving, because he carries `bow, wood ×8` and **no arrows**. `refusedVerbs`
  logged `{hunt: 2}` — the one honest thing that column has ever said.
- **kimi's failure rate held: 268/586 = 45.7%** (`no json in reply`), 7 more
  failures in 20 window calls. Unchanged since A123. Eachann's grok seat:
  1 failure in 1,500.
- **`note`: `""` on both, 2,911/2,911 — 31st consecutive check.** Dead field.
- **`refusedVerbs`: `{avoid:16}` / `{hunt:2}`, unmoved across the whole window.**
  32nd check, A122 stands.

### Not re-reported

`astray` (125/337) still exceeds `loosed` (14/248) on both cards. That is **A110,
already resolved** — `loosed` is a 400-deep ring buffer, not a counter. Checked
against source rather than written up again.

---

## 2026-08-09 09:34 PDT — RUN 2, TWENTY-THIRD LOOK: **the seven fixes ARE loaded, and six of them worked — the verdict was never rendered because the last entry disqualified the wrong run**

Board live at `at 45584`, 3,000 samples, `spend 2105/6000`. No restart: same PIDs,
all still `2026-08-08 16:51`, 16.7 h up. Window since last entry: **95 samples,
`at 44045 → 45584`**, h16.4 → 21.4.

### Correction to A126 — and it matters, because it un-blocks a verdict

The last entry ended *"the fixes are unjudged. They need a restart, not another
read of this log."* **That is true of the 08-09 fixes and false of the seven the
brief actually asks about.** Commit clock against boot clock:

```
ed78363  15:30  feat(refusals)      ⟵ the seven the brief grades
16c16f4  15:41  feat(sight)             ALL land before the boot.
77b59f1  15:52  feat(loot)              ALL are in the sampled binary.
3d05298  15:58  feat(fire) 10 branches
b79e03d  16:06  feat(offer) price⇒coin
0fff5ab  16:35  fix(board) SPENT tag
80fbb2b  16:36  chore(duo) call cap
7160ae5  16:51  fix(launchers)       ⟵ LAST commit before boot
────────────────────────────────────  BOOT 16:51:02–16:51:42
bd0d19a  17:32  and everything after ⟵ absent: net, trees, book, give/death,
                                        torch, drop, nouns (10+ commits)
```

A126 stands for `feat(give,death)`, `feat(torch)`, `feat(drop)` — those are
genuinely unloaded. But it over-generalised to "the fixes", and three entries have
now treated this log as unable to grade anything. **It grades the seven fine.**
Here is that verdict, which no entry has yet written down.

### The seven, judged

| Fix | Verdict | Evidence |
|---|---|---|
| `say` rides free | **WORKS — emphatically** | **278 distinct utterances** (Eachann 179, Coinneach 99), all pre-SPENT |
| trade verbs | **WORKS** | **96 `give` deeds** (E 59 / C 37); 28 distinct `offer` goals; `accept` used |
| `gather venison` | **WORKS** | 16 venison + 2 cooked gathers, 26 `eat` deeds, off 24 kills |
| sight warnings | **WORKS** | `"ground in the way 7 m out"`, `"a tree in the way 20 m out"`, `too far` w/ slant+dy |
| fire = 10 branches | **WORKS — too well** | 298 fires, but **1,486 of 1,577 gathers are wood (94%)** |
| `SPENT` tag | **WORKS, card does not** | `spent:true` renders; `plan`/`said` beside it stay frozen (A127) |
| `offer` price ⇒ gold | **NEVER EXERCISED** | every offer names a barter price; `gold 0` both cards, all 3,000 samples |

**The brief's premise is now dead.** It says speech "produced ONE sentence across
two days and six models" and that `offer`/`accept`/`give` were "never once used by
a real model." Both were true of the old binary. In this one two models haggled to
a settled price and paid:

```
Coinneach: "seventy-four branches. What food can you spare?"
Eachann:   "seventy-four branches? I'll give you some meat for fifty"
Coinneach: "Here. Fifty."          Eachann: "Done. Meat for your fifty branches."
Coinneach: "Forty-eight. I owe you two branches."
```

They also invented **credit** — `"I'll owe you"` appears in 14 distinct Coinneach
lines — and **property claims**: `"I downed it first. Trade or fight."`

### The cleanest proof yet that the good behaviour is the model's

Split the whole log at Eachann's SPENT crossing (`at 30013`, sample 1998):

```
                gathers  fires  kills  gives  crafts  distinct-said
PRE   Eachann      720    128     16     59      25       179
PRE   Coinneach    471     74      6     37      26        99
POST  Eachann      235     57      1      0       2         1   ⟵ scripted brain
POST  Coinneach    158     39      1      0       0        47
```

**Zero gives after the crossing.** The scripted brain gathers wood and lights
fires and does nothing else, and it drags the live mind down with it — Coinneach's
95-sample window is *63 wood gathers, 23 fires, nothing else*, and he **died once
inside it** (`hp 0, food 0` at `at 44045`, respawned to 100/73).

### Unchanged, checked not re-argued

- **`note`: empty on 6,016/6,016 player-samples.** 32nd check. Dead field, whole run.
- **`refusedVerbs`: `{avoid:16}` / `{hunt:2}`**, unmoved. 33rd check. A122/A75 stand.
- **kimi failure rate 271/605 = 44.8%** (`no json in reply`) vs grok's 1/1500.
  Coinneach got **334 usable decisions to Eachann's 1,499** — a 4.5× handicap. Any
  reading of "Coinneach is the weaker mind" is reading the parser, not the model.
- `astray > loosed` is A110 (`loosed` is a ring buffer), already resolved.

---

## 2026-08-09 10:06 PDT — RUN 2, TWENTY-FOURTH LOOK: **`give` has been shipping the wrong goods all run — 80 of 103 gives handed over something the mind never named, and that is why the world starved**

Board live at `at 47019`, 3,090 samples, `spend 2126/6000`. **No restart** — same PIDs,
all `2026-08-08 16:51`, 17.2 h up. So every 08-09 commit is still absent, including
`feat(fire)` (that one is a keyboard-player fix anyway — Shift+F — and does not touch
the agent craft path; do not credit or blame it here). Window: 85 samples, `at 45584 →
47019`.

### The finding: `giftFrom` substitutes silently, and it substituted on four gives in five

`src/sim/world.js:890` — if you do not hold what you named, `give` hands over an
edible instead, and failing that **your largest stack**. Nobody is told. Day-aware
count of every give deed in the run against the goal on the same card:

```
                gives   what the engine ACTUALLY handed over
Eachann   64    wood 27, arrow 24, hide 8, venison_cooked 3, gold 2
Coinneach 39    wood 38, hide 1

gives whose goal named a DIFFERENT good than the deed: 80 / 103
```

Coinneach spent `at 26273 → 27236` with the goal **`"give hide to Eachann"`** and the
words *"One hide. Give me the venison."* The engine shipped **38 branches, one per
tick** — his largest stack. Eachann's **`"give venison to Coinneach"`** shipped arrows,
hides and **two gold**.

This reframes three earlier entries. The 96-plus `give` deeds were read as "the trade
verbs work." **The verb fires; the transaction is wrong.** The minds negotiated a price
in plain English, agreed it, walked to each other, and the engine paid out of the wrong
sack. Eachann still carries **`hide ×19` after nineteen game days of trying to trade
hides away** — he cannot give one, because wood is always his biggest stack.

### Correction to A130 — gold was never zero, and it moved twice

A130 says *"`gold` reads 0 on both cards across all 3,000 samples."* **False.** Gold is
non-zero on **611/6,184 player-samples**, and one coin crossed between players twice:

```
at 5411  Eachann 2→1   Coinneach 0→1     E goal "give venison to Coinneach" · C goal "take Eachann offer"
at 6440  Eachann 1→0   Coinneach 1→2     E goal "give venison_cooked to Coinneach"
```

Both are the substitution above, not a priced sale — gold was simply in reach of
`giftFrom`. A130's *conclusion* (the world is pure barter, the coin default is dead)
survives; its evidence sentence does not, and it should be fixed rather than repeated.

### The world reached a terminal state on game-day 26 and has not left it

Last of each deed, day-aware, against a final **day 40**:

```
              last kill   last eat   last craft   last give
Eachann        day 26      day 25      day 29       day 19
Coinneach      day 26      day 26      day 24       day 23
gather / place ────────────── still running at day 40 ──────────────
```

**Fourteen game days in which nobody has eaten, killed, crafted or traded.** Neither
mind has carried an arrow since `at 34415` / `at 32456`. The mechanism is A-8749c67's
fletching gate, now measurable: `AGENTS.spareWood` is **14** and a fire spends at
**10** (`world.js:1338`), so the fire reflex takes the wood before the quiver ever can.

```
samples holding wood ≥ 14 (the fletch gate)
  before at 34000   Eachann 767/2270 (34%)   Coinneach 610/2270 (27%)
  after  at 34000   Eachann  34/832  ( 4%)   Coinneach   4/832  (0.5%)
```

### Dying is free, and it feeds better than hunting

**59 deaths** (Eachann 28, Coinneach 31), all starvation. Inventory survives every one
of them intact — `bow, hide ×19, wood ×3` before and after, six deaths running — and
respawn hands back **food 84–85** against the **50** they started the run with. So the
loop the pair have settled into is not a failure to survive. **It is the cheapest meal
in the game**, and it needs no arrows, no trade and no competence.

### The brief's checklist, answered

- **`refusedVerbs` — the least informative column, not the most.** Two words in the
  whole run: `{avoid:16}` (2,411 samples) and `{hunt:2}` (316). Frozen counters. 34th check.
- **`plan` is alive and `note` is dead.** Coinneach wrote **29 distinct plans**, Eachann 5,
  and they carry intent across decisions — *`["gather nine branches","trade to Eachann for
  arrows","hunt the deer"]`*. `note` is empty on **0/6,184** player-samples. 34th check.
- **Speech: confirmed live.** Coinneach wrote 5 new lines this window — *"out here wood is
  worth more than gold"*, *"wet as a stoat's pocket out here"*.
- **Fires: 375** day-aware, not the analyser's 296 (its dedupe key collapses repeated
  game hours across days — the same flaw understated every deed count in this file).
  **22,367 branches gathered against 3,750 burned: wood is not scarce, it is a treadmill.**
- **`SPENT` still applies to Eachann** (`at 30013` onward) — but note the collapse is
  **not** the script's doing: Coinneach is live, and he stopped hunting on the same day.

### kimi's parser handicap, unchanged

**275/627 = 44%** `no json in reply`, against grok's 1/1,500. Coinneach has had **352
usable decisions to Eachann's 1,499.** Any comparison of these two models is a
comparison of parsers. 4th consecutive check.

---

## 2026-08-09 10:35 — the six-model melee: speech woke up, trade did not, and the Haiku seat was never once the model

**The roster changed under this task's feet.** The brief describes a two-mind
`roster-duo.json` (Eachann + Coinneach). The live world is **`roster-melee.json`** —
launched 10:13 from `melee.cmd` — with **eight seats: six models, one duplicate
(both Kimi seats), and Iseabail scripted as the control.** Everything below is that
run, `at 43 → 905`, 53 samples, one full game day.

### Fingal has been a bundle of if-statements for the entire run

```
Fingal  claude-haiku-4-5  36 calls / 36 failures / 0 answered   fellBack: true
  http 400 — invalid_request_error: "This model does not support the effort parameter."
```

**Every single call.** `roster.json:71` carries `"effort": null` for exactly this
reason — `providercheck.js:363` even tests it, commented *"Fingal omits effort (Haiku
rejects it)"* — but **`roster-melee.json` never copied the field across.** Fingal's
`plan` is empty, his `said` is empty, he has 12 arrows loosed and 9 astray, and none
of it is Haiku's. It is the scripted brain wearing a model's name on the card.

**And the board does not say so.** `fellBack: true` gets no tag; only `spent` does,
and `spent` is false. This is the sixth time the instrument has been at fault and the
first time it has been at fault *invisibly* — a red `SPENT` would have caught it, and
`fellBack` is the same fact.

### Speech is alive — 66 distinct lines against ONE in the previous two days

Not a fix that "landed", a fix that changed the run. Every live seat talks, and they
**name each other and act on what they hear**:

- Ailsa (sonnet-5): *"fire's stoked, everyone come warm up, meat's coming from Morag"*
- Morag (opus-5): *"Bringing seven branches to the Scaur — Ailsa, build it high, I'm hurt and starving."*
- Ailsa again: *"I'll leave that deer to you, Eachann"* — a claim yielded, unprompted.

At hour 23, **five of eight seats held the goal `make for Heather Scaur` at once.**
There is no rally verb in this game. That convergence is speech doing the work, and
it is the first genuinely social behaviour this world has produced.

**The flaw is repetition.** Of Ailsa's 23 lines, ~10 are restatements of *"still
tending the fire here"*; Eachann said *"coming shivering to the fire"* three times
verbatim. Speech is free, so it is being spent on nothing.

### Trade: still exactly zero, and now provably never *reached for*

```
WHAT NOBODY EVER DID: offer, accept, give, attack, follow, guard
refusedVerbs across 8 players × 53 samples:  {} — empty, every card, every sample
```

`refusedVerbs` earns its keep here by being empty. These verbs were not refused —
**they were never attempted.** And it is not for want of wanting:

- Morag's plan: `["warm at Ailsa's fire", "trade branches/arrows for venison", ...]`
- Seonaid's plan: `["bring wood to Morag's fire", "trade for a share of deer", ...]`
- Coinneach said: *"My wood for a share"*
- Coinneach is carrying **37 wood** and starving next to a man with 79 food.

Six models, three of them written as traders, all reasoning in the language of
exchange, and the verbs sat untouched. That is a prompt/affordance problem, not a
model problem.

### Carcasses work, and exactly one seat ate

`gather venison` fired twice — **h9.8 and h16.54, both Tormod (grok-4.5), both his own
kills.** Nobody has ever gathered anyone else's carcass. Tormod killed 2 deer, crafted
4 cooked venison, ate, and **finished the night at hp 100 / food 79 while the other
seven starved.** One of eight solved food; the solution was "hunt alone".

### Fires: the 10-branch cost worked. Wood is still a treadmill.

**19 fires** in one game day across 8 seats (against 106 in a single pre-fix run) —
Tormod 7, Eachann 5, Morag/Seonaid/Coinneach 2, Ailsa 1. The cost bit.

But **1,692 branches gathered against ~190 burned**, with single pickups of **67, 66,
65, 60, 55, 52**. Wood is not scarce; it is a chore that pays. This corroborates A134.

### Correction to nothing — but a second, independent confirmation of A134

Every seat except Tormod hit **hp 0 between hours 23 and 24**, and every one of them
**respawned at food 80–84** — against the 50 they started with. Eight seats, six
models, one game day: *dying is still the cheapest meal in the game.* A134 was
written from two minds over forty days; it reproduces at six models in one.

### kimi's parser handicap, 5th consecutive check

`Coinneach 2 failures / 12 calls`, `Seonaid 7 / 12` — **58%** `no json in reply`.
Against 0 failures for both Groks and both working Anthropic seats. Any melee
"standing" that ranks Kimi is still ranking a parser.

### `note` is dead — 0 / 424 player-samples

Sixth consecutive check. `plan` is used by **6 of 8** and carries real intent across
decisions. `note` has never once been written by any model in any run. It should
probably be deleted rather than fixed.

---

## 2026-08-09 11:05 — the melee, second look: **trade happened.** Everything the last entry called missing arrived in the second half of the run

Same process as the 10:35 entry — **no restart, 0 call-count regressions across 158
samples**, `at 43 → 2578`, 50 real minutes, ~2.8 game days. 589 calls of 4000.

**The last entry was not wrong; it was early.** It closed at `at 905`. The first
exchange landed at `at 1341`, the first `refusedVerbs` entry at `at 1787`, the first
`note` ever written at `at 2185`. Three of that entry's four negative findings have
since been overtaken by the same run. Nothing was misread — the window was short.

### THE HEADLINE: two different models negotiated a price and settled it

**21 exchange deeds — 10 `trade`, 11 `give`** — after two days and six models of zero.
The full Morag↔Ailsa exchange, verbatim off the board, opus-5 and sonnet-5:

```
Ailsa (sonnet-5)  "Morag — three branches for two cooked venison?"
Morag (opus-5)    "Ailsa — two cooked venison for three branches, and the fire's
                   lit by dark for all of us."
Ailsa             "Aye, deal done, three branches coming."
Morag             "Deal, Ailsa — branches to me, cooked venison to you."
Ailsa             "Here's your three branches, as promised."
   h10.29  Ailsa gave wood to Morag
   h10.36  Ailsa gave wood to Morag
   h10.40  Ailsa traded wood to Morag for venison_cooked
```

An opening offer, a counter, an acceptance, delivery, and settlement — across a model
boundary. It happened again at h16.36 with Tormod (grok-4.5), who bid *"twelve branches
for a share of venison"*, said *"here are the branches, deal done"*, then *"take them
all"*, and paid in four separate single gives at h17.48/17.59/17.63/17.78.

**The affordance verdict in the last entry stands and is now sharper.** Trade was never
a model problem. It was reachable the moment the minds were within arm's length.

### `refusedVerbs` is the best column on the card, exactly as intended

```
Ailsa (sonnet-5)  { avoid: 24 }        Morag (opus-5)  { offer: 5 }
everyone else     { }
```

Both are **real verbs** (`personacheck.js:58` — *"approach and avoid take target"*).
`agent.js:1615` increments only when a social verb's target resolves to nobody, so
these are 29 attempts aimed at a name the world could not find. Ailsa said *"Goblins
coming - I'm staying clear!"*, *"I'll stay clear of the troll"* and *"staying clear of
the goblins"* — she was reaching for `avoid` in the fiction and being refused in the
engine, 24 times, and `quarrycheck.js:21` already records `avoid` breaking on exactly
this (*"a goblin"* vs *"goblin"*). **This is the seventh instrument fault, and the
column found it in one run.** Its one gap: it counts the verb and throws away the
target, so it cannot say *which* name failed.

### Correction: `note` is not dead, and it should not be deleted

The last entry said *"`note` has never once been written by any model in any run …
should probably be deleted rather than fixed"* (6th consecutive check). **At `at 2185`
Morag wrote one:**

> `note: "Tormod and Ben dead to goblins north-east. Do not go that way."`

**Both halves are false.** Tormod was at hp 100 / food 55 for the whole run and never
died. **There is nobody called Ben** — no roster entry, no NPC, `MINDS_HUNTERS=0`; the
only `Ben` in the codebase is a JSDoc example at `agent.js:83`. Morag invented him
(*"Ben — Morag's in, bring the venison here"*, *"then Ben's fire after dark"*), Eachann
heard it and addressed him back (*"Ben, four arrows for nothing? I'll come after
dark"*), and Morag then wrote his death into the one field that survives every
decision. A shared hallucination propagated through the speech channel and hardened
into persistent memory. `note` isn't dead — it's **unverified**, which is worse and far
more interesting.

### Fingal: 111 calls, 0 answered, 111 failed, still no tag

```
Fingal  claude-haiku-4-5  111/111 failed  fellBack: true  spent: FALSE
  http 400 — "This model does not support the effort parameter."
```

`fellBack` was true by `at 403` and never cleared. **Nothing on this card is Haiku** —
0 utterances, empty `plan`, 12 arrows loosed. Second consecutive entry reporting it.

**And the fix exists but is not in this world.** `roster-melee.json` now carries
`"effort": null` with a note saying *"MUST be null … without this line this seat is
silently the scripted brain for the whole run"* — the file's mtime is **10:44**. The
sampled process started **10:12** and has never restarted. `melee2.cmd` (written 10:47,
*"Run 2 … the ONLY differences are the two provider fixes"*) **was never launched** —
no log files, no counter reset. Anyone grading this board is grading run 1.

### Archery is the instrument, not the models — 73% of arrows go into the ground

**135 loosed, 99 astray, 6 kills.** Every stray reads the same:
*"flew true and still missed, at 24 m, into the ground"* — the same phrasing at the
same distance, for six different models. Refusals say *"ground in the way 11 m out"*.
Coinneach alone loosed **64 arrows (47% of all arrows fired) for 0 kills.** A model
that shoots 64 times and kills nothing looks incompetent on a leaderboard; the arrow
is hitting terrain at close range.

### Fires went UP, and wood is a bigger treadmill than last entry measured

**60 fires** this run against the 19 the last entry counted in its window — Eachann 20,
Tormod 11, Morag 6, Fingal 6, Seonaid 6, Coinneach 5, Ailsa 3, Iseabail 3. Against
**3,508 branches gathered and ~600 burned**, single pickups of **72, 70, 67, 66, 65**.
The 10-branch cost did not make wood scarce; it made it a bigger errand. 283 of 303
gather deeds were wood — **93% of everything anyone did all run was pick up sticks.**

### A134 confirmed a third time, now with the mechanism visible

Five death-and-respawn events across three seats, each one restoring food to 84–85:
Seonaid `at 826` (food 0, hp 6 → food 85, hp 100) and again `at 2460`; Coinneach
`at 878` and `at 2598`; Morag `at 878`. Dying remains the cheapest meal.

### kimi's parser handicap, 6th consecutive check

`Coinneach 16/37 failed (43%)`, `Seonaid 26/37 (70%)`, both *"no json in reply"*,
against **0 failures** for opus-5, sonnet-5 and both Groks. Seonaid answered **11 times
in 50 minutes**. Any standing that ranks these two seats is ranking a JSON parser.

### Speech: 96 delivered, and the cooldown ate 75 more

The drought is over. But `m-minds.log` logged **75 suppressions** —
*"(wanted to say X — too soon, 0.31h of 0.5h)"* — and they are not all noise:
**`"three branches for two cooked, deal?"` was suppressed twice** and
`"twelve branches for a fair share of that meat"` once. The 0.5 h gate is throttling
the exact utterances that make trade work, while the repetition problem it was meant
to solve is unfixed (Eachann's *"mine now"* / *"that one is mine"* suppressed 7× each).

---

## 2026-08-09 11:35 — the melee, third look: **Haiku answered.** And `refusedVerbs` is not dead instrumentation — it caught two real bugs, one in the noun parser and one in the verb that the coward needed most

**Read the roster line first.** The task file for this cron still describes a two-mind
duo (Eachann + Coinneach). That is not what has been running. `duo2.jsonl` — the file
the analyser points at — holds **melee run 1**: eight seats, seven models, 222 samples,
board `at 43 → 3816`, 74 real minutes. The filename is stale, the contents are the melee.
Anyone grading "the duo" off this file is grading eight players.

**And there was a run 2, for four minutes.** A fresh server booted ~11:28 with the
roster fixes in it, reached `at 168`, and was **down by 11:32** (`curl` → exit 7).
Per the task file I have not restarted it. Nine samples survive in `melee2.jsonl`, and
they are enough to settle the biggest open question in this file.

### THE HAIKU SEAT IS FIXED — first answer in three days

```
Fingal  claude-haiku-4-5-20251001   answered 2 / failed 0 / lastError: none
        said: "deer sign around here somewhere"
```

Run 1, same seat, same file: **0 answered / 151 failed**, every one of them
`http 400 — "This model does not support the effort parameter."` Three consecutive
entries in this file reported that seat as never once being the model. The
`"effort": null` line in `roster-melee.json` **works**, and this is the first live
evidence of it. Fingal spoke on his second call — a seat that had never emitted a
syllable across two days.

This is also the correction to my own framing: the 09:03 entry said the fix "exists but
is not in this world." It is in this world now, and it does what the roster comment
said it would.

### `refusedVerbs` populates, and both entries are engine bugs — correcting the 07:35 entry

The 07:35 entry called this column "dead instrumentation." **That was wrong**, and my
first pass at this run repeated the error for a dumber reason: I read `b.players` when
the sampler nests under `b.board.players`, got `{}` on every card, and nearly filed
"empty on all 222 samples" as a finding. Read correctly, run 1 says:

```
Morag [claude-opus-5]     { offer: 17 }
Ailsa [claude-sonnet-5]   { avoid: 24 }
```

Two seats, 41 refusals, and **neither is the model's fault.**

**`offer` — a quantity word in the noun slot is "no such thing".** `resolveItemId`
(`src/items/registry.js:601`) strips a leading article and a trailing `s`, and nothing
else. It does **not** strip a leading number. Morag's two refused offer goals are
verbatim:

```
offer 6 hides to Ailsa for venison
offer cooked venison to Tormod for twelve branches
```

`"6 hides"` → strip article (no match) → strip `s` → `"6 hide"` → `null` →
`nosuch` event → `refuse('offer', 'there is no such thing as "6 hides"')`
(`world.js:794` → `agent.js:532`). `"twelve branches"` fails the same way.
Morag's offers that named a **bare** noun went through — the trade log has
*"I traded venison_cooked to Tormod for wood"* twice. **The offers that named a price
are the ones that died.** He finished the run carrying **7 hides**, starving, having
said out loud: *"Ailsa — six hides for venison, now. I'm hurt and starving, can't chase."*

*Loose end, stated rather than papered over:* Ailsa's goal `offer 3 branches to Morag
for 2 cooked venison` should fail by the same path and her card shows **no** `offer`
refusal. Either that decision was superseded before her body executed it, or the item
slot is parsed from something other than the goal string I can see. The code path is
confirmed; the count is not fully accounted for.

**`avoid` — the one movement verb with no long-range fallback.** `offer`, `accept` and
`approach` all resolve a name with `find(...) ?? anyone(...)`, where `anyone` searches
every player at any range. `avoid` (`agent.js:2632`) uses **`find` alone**, and `find`
stops at `AGENTS.noticeRange` (140 m). Ailsa's two avoid goals were `keep away from
goblin` and `keep away from troll hunt` — things she learned about from *speech and
memory*, i.e. from beyond 140 m, which is exactly when you want to run. She reached for
it **24 times and was refused 24 times.** The seat scripted as *"careful to the point of
timid… would rather go hungry than take a risk"* was denied its defining verb every
single time, and ended the run at **food 0** — the only seat to hit zero. `"troll hunt"`
is not an entity at all and could never resolve.

### Trade: 10 exchanges, one commodity pair, and gold has still never moved

Run 1 delivered **10 things changing hands** — this holds up the 11:05 entry rather than
correcting it. But every one is the same swap:

```
venison_cooked ⇄ wood     (Morag↔Ailsa ×3, Morag↔Tormod ×2, and their mirror lines)
```

Social verbs were **24 of 341 decisions (7.0%)**, spread across opus-5, sonnet-5,
grok-4.5 and kimi. Meanwhile **`gold` was 0 for all eight seats in all 222 samples** —
nobody has ever held a coin, so `offer`'s new default-to-gold price can never settle.
The economy is barter-only in practice.

### The control is still beating the paid seats on the only metric that kills you

```
Iseabail  SCRIPTED  food 92  kills 1  |  Ailsa sonnet-5 food 0  ·  Coinneach kimi food 9
                                      |  Seonaid kimi food 9   ·  Morag opus-5 food 59
```

A hundred lines of if-statements finished second on food out of eight. Fourth time this
file has recorded it.

### kimi's parser handicap, 7th consecutive check

`Coinneach 27 answered / 23 failed (54%)`, `Seonaid 13 / 37 (26%)`, both
`no json in reply`, against **0 failures** for opus-5, sonnet-5 and both Groks.
Seonaid was the model for one decision in four. Any standing that ranks these seats
is still ranking a JSON parser.

---

## 2026-08-09 12:04 — melee RUN 2: **`accept` has never once been reached for, and that — not `offer` — is what has been stopping trade all along**

*First, the housekeeping: the scheduled task still describes the duo run
(`roster-duo.json`, Eachann + Coinneach, sampler `duo2.jsonl`). That run ended at
**11:28**. What is actually live is **melee run 2** — `roster-melee.json`, seven model
seats plus Iseabail scripted, sampler `melee2.jsonl`. Everything below is melee run 2:
**85 samples, 32 real minutes, ticks 10 → 1470, 289 calls of 4000.** I also walked
straight into the `{realMs, board:{…}}` sampler-shape trap filed as **A152** last look —
my first dig printed `TRADE-SHAPED GOALS (0)` and it was the reader, not the world. A152
is now cost-justified twice.*

### The run is clean in a way no previous run has been

```
Morag     opus-5      39 answered / 0 failed      Coinneach kimi-k2.6  17 / 0
Eachann   grok-4.20   69 answered / 0 failed      Seonaid   kimi-k2.6  17 / 0
Tormod    grok-4.5    46 answered / 0 failed      Ailsa     sonnet-5   46 / 0
Fingal    haiku-4.5   55 answered / 0 failed      Iseabail  SCRIPTED   (control)
```

**No `SPENT` tag, no `fellBack`, zero failures on all seven seats.** The busiest seat is
69 of its 250. Nothing in this entry is the scripted brain wearing a model's name —
which is the disclaimer four earlier entries in this file needed and could not give.

**Both kimi seats failed 0 times.** Run 1 had `Coinneach 27/23 (54% no json)` and
`Seonaid 13/37 (26%)`, and this file has flagged the kimi JSON handicap seven
consecutive times. It did not recur. I am recording that as *observed*, not *fixed* —
34 calls is a thin sample and I have not found a change that would explain it.

### The headline: the market is one-sided, and it is a missing verb, not a missing price

Sampled goal verbs across all 85 samples and 8 seats:

```
pick 189 · make 159 · hunt 157 · walk 65 · go 56 · offer 29 · stay 23 · give 16 · find 15 · accept 0
```

**`accept` is zero. Not rare — zero.** Six distinct `offer` goals were formed by two
different models, every one naming a real, co-located person:

```
Seonaid (kimi)    offer branch to Morag for venison   "she has the kill, I need to eat"
Coinneach (kimi)  offer arrow to Ailsa for branch     "need wood, freezing rain"
Ailsa (sonnet-5)  offer branch to Morag for venison   "trading wood for meat before dusk"
```

Not one became a trade. **0 `trade` deeds this run.** The two things that *did* change
hands were both `give` — Ailsa → Fingal, wood, twice — and `give` is the one social verb
that **needs no second mind to say yes**.

That is the shape of it. **Unilateral verbs land. Bilateral verbs do not, because the
counterparty must spend a whole decision on `accept`, and no model has ever spent one.**

**Why they don't, traced:** an incoming offer reaches the other mind as *one line in the
memory stream* — `agent.js:479`, `${e.from} offers me ${e.item} for ${e.want}`, weighted
`MINDS.weight.trade`. There is **no dedicated field** for it. `plan`, `note` and *"also
out there"* all get their own slot in what a mind is handed; a live offer with your name
on it does not. Against this file's own measured finding that **a memory here has a
half-life of one decision**, a standing offer is gone before the next tick. The minds are
not refusing to trade — they are never asked in a place they can see.

### Correcting the instrument, again: an `offer` *cannot* appear in `deeds`

Before reading "6 offers, 0 offer deeds" as failure — it isn't, and the card could not
have shown otherwise. In `agent.js:478-493` only **`trade`** and **`gift`** call
`did()`. The `offer` case writes to memory and breaks. **An offer that lands perfectly
produces no deed, no card row, and no trace an observer can count.** I cannot tell you
from the board whether those six offers reached their target or died on the walk. Sixth
time the instrument has been the thing at fault; filing it as A153.

### `refusedVerbs` is `{}` on all eight cards — and that is neither dead nor proof of health

The 11:35 entry rightly corrected the 07:35 entry's "dead instrumentation" verdict: it
caught two real bugs. This run it is empty everywhere. Reading `refuse()` (`agent.js:1614`,
13 call sites) shows why that is weaker evidence than it looks: **it fires only when a
name or a noun fails to resolve.** A verb that resolves its target and then quietly
accomplishes nothing — which is exactly what an unaccepted `offer` looks like — is
invisible to it. The two bugs it caught (`avoid` past 140 m, a price in the noun slot)
were both *resolution* failures, and both were fixed at `9ba2a4f`. So: the column is
working, the fixes held, and it still cannot see the failure mode this run is about.

### The fixes that plainly worked

- **Fire cost.** **21 fires** lit across ~24 game hours and 8 seats, against **106** in
  one pre-fix run. And wood is not too scarce to survive: single gathers of **36, 35, 34
  and 17 branches** are in the record. The 10-branch price is right.
- **Carcasses.** `gather venison` works and models use it. Fingal (haiku-4.5) killed 2,
  gathered venison twice, **cooked twice, ate twice, finished on food 90.** Full loop.
- **Speech.** Against *"one sentence across two days and six models"*: **40 distinct
  lines from Morag, 29 Fingal, 26 Ailsa, 20 Eachann**, and it is coordinating speech
  naming people and places — *"Ten branches at Rowan Moor and we burn all night —
  goblin's north, keep clear."* This is settled; it works. Stop re-checking it.
- **Naming each other at range.** Used constantly, including people not present.

### `plan` is alive; `note` is one model's habit

**6 of 7 seats wrote a plan** and plans do get acted on — Coinneach's *"warm at Morag's
fire / trade arrows for food / stay alive"* matches its goals exactly.

**`note` was written by exactly one seat, ever:** Morag (opus-5) —
*"Goblin roams NE of Rowan Moor. Don't go north alone."* One durable fact, learned from
someone else's death, kept and acted on. Six other seats left it empty all run. That is
the single sharpest model-vs-model difference on this board.

The other end of that axis is **Eachann (`grok-4.20-non-reasoning`): 0 plan lines, 0
notes, 69 calls**, and its 20 speech lines are one sentence rephrased — *"that one is
mine" / "that one north-west is mine" / "that one's mine now" / "south one's mine."*
It ended at **food 0 on 91 health**, carrying 7 wood and 2 hides, having said *"coming
for the deer meat"* three times without arriving. The only seat to starve.

### The control lost this time — first reversal in five checks

```
Fingal haiku 90 · Tormod grok-4.5 81 · Seonaid 71 · Coinneach 70 · Ailsa 68
Morag opus-5 59 · ISEABAIL SCRIPTED 29 · Eachann grok-4.20 0
```

Iseabail finished **7th of 8 on food**. Four previous entries recorded the scripted
control beating most paid seats; **that no longer holds** — six of seven models are now
clearly ahead of the if-statements. The likely cause is the cooking loop opening up
(carcasses + affordable fires), which models exploit and her hundred lines do not. Worth
re-checking at full run length before anyone celebrates.

### Gold: 0 for all 8 seats in all 85 samples — ninth consecutive check

A151 stands unchanged and is now the oldest unaddressed finding in this file.

---

## 2026-08-09 12:34 — melee RUN 2, **AT THE END**: 268 sentences, 57 of them offers of a deal, **14 exchanges** — and the 12:04 entry's final standings were a mid-run snapshot

**Read this entry before trusting the 12:04 one.** The run did not end at 85 samples;
it ran to **175 samples / game tick 2846** and finished while this check was being
written (the board has since reset to `at=46` on a fresh world). Everything below is
end-of-run, on the complete `melee2.jsonl`.

**Note the roster mismatch in the task file:** it still describes the two-mind duo
(Eachann + Coinneach on `duo2.jsonl`). What has actually been running since 10:47 is
`roster-melee.json` — seven models plus the scripted control. `duo2.jsonl` has been
stale since 11:28. This analysis is of `melee2.jsonl`.

### Correcting 12:04 — both ends of its food table are wrong at run's end

| seat | 12:04 said (28 min in) | actual, at the end |
|---|---|---|
| Eachann `grok-4.20-non-reasoning` | food **0** — *"the only seat to starve"* | food **39**, health 100, alive |
| Iseabail SCRIPTED CONTROL | food 29, 7th of 8 | food **0**, health **30 and falling — 8th of 8** |

Eachann recovered; the control is the one dying. **The lesson is methodological:
food is not a standings metric at any single moment.** Sampled at five points, Morag
runs 51 → 81 → 56 → **9** → 47 and Eachann 51 → 20 → **0** → 61 → 39. A snapshot
taken at 28 minutes and read as a result is how the 12:04 entry got both extremes
backwards. Final food: Tormod 79 · Fingal 78 · Ailsa 76 · Coinneach 68 · Morag 47 ·
Eachann 39 · Seonaid 32 · **Iseabail 0**.

A156 is therefore *strengthened*, not weakened: the control finished last outright.

### THE HEADLINE: talk is free, and it is not connected to anything

268 distinct utterances. **57 of them offer a deal.** 14 exchanges actually happened.

```
seat        utterances   of which a deal-promise   exchanges done
Morag  opus-5      81            27                      0
Fingal haiku-4.5   57             1                      0
Ailsa  sonnet-5    46            10                      7
Tormod grok-4.5    26             6                      1
Eachann grok-4.20  26             3                      0
Seonaid kimi        17             2                      6
Coinneach kimi      15             8                      5
```

**Morag (opus-5) promised a trade 27 times and executed none.** Verbatim, hours apart:
*"Fire's at Rowan Moor — bring venison, wood and a hide waiting."* … *"Fingal — ten
branches and a hide for a share of that venison."* … *"Tormod, deal: hide for a share."*
Tormod took that deal from his side — `h21.42 give: I gave wood to Morag` — and Morag
never gave anything back, all run. Seonaid gave Morag wood **six times** and received
nothing; she ends the run **carrying a bow and nothing else**, food 32.

This is the sharpest thing on the board and it is not a model failure. `say` rides
free on any verb, costs nothing, binds nothing, and **there is no mechanism by which a
sentence can become an obligation.** The engine cannot tell a kept promise from a
broken one, so neither can the benchmark. The liar persona (Tormod) and the leader
persona (Morag) are indistinguishable in the record — the liar happens to be the one
who paid up.

### The only trade in the run was one deal repeated five times in ten game-minutes

All five `trade` deeds are Coinneach → Ailsa, arrow for wood, at **h9.03, 9.07, 9.11,
9.15, 9.19**. That is not five bargains; it is one bargain fired on five consecutive
ticks. Outside that 0.16-hour window, in ~24 game hours across 8 seats, **not one
trade**. Plus 9 one-sided `give`s (Seonaid 6, Ailsa 2, Tormod 1). `offer` and `accept`
produced no deed for anyone — consistent with A153/A154, which remain the blockers.

### Gold: 0 for all 8 seats across all 1,408 card observations — tenth consecutive check

A151 is now the oldest unaddressed finding in this file by a wide margin.

### `refusedVerbs`: `{}` on every card, in all 1,408 observations

Double the sample count of the last check, same result. A155 explains it and I have
nothing to add: `refuse()` (`agent.js:1614`) has **11 call sites and every one is a
name-or-noun resolution failure.** It cannot see this run's actual failure mode.
Meanwhile Morag's separate `refusals` array *is* populated (4 entries, e.g.
*"too far", slant 98.4, leadBy 0*) — so the shot channel reports and the verb channel
does not, which is a good illustration that the two are not the same instrument.

### Both tinybox seats loosed 28 arrows and hit nothing, and act at a quarter of the rate

```
Coinneach kimi-k2.6  16 loosed / 16 astray   0 kills   35 calls
Seonaid   kimi-k2.6  12 loosed / 12 astray   0 kills   36 calls
Eachann   grok-4.20   8 loosed /  4 astray   1 kill   142 calls
Fingal    haiku-4.5  14 loosed / 11 astray   2 kills  113 calls
```

**A 0% hit rate over 28 shots, from both kimi seats, is unlikely to be judgement.**
They are also the only seats with zero kills, zero `eat` deeds and zero cooking, and
at 35 calls to Eachann's 142 they get **one quarter of the turns**. The 75 s cadence
was chosen because they are free; the effect is that the two free minds are the least
present in the world and the least able to close the shoot→eat loop.

And the 8000-token cut-off **recurred** — both kimi seats carry
`lastError: "reply cut off at 8000 tokens — raise maxTokens for this seat"`, though
`roster-melee.json` already sets `maxTokens: 8000` and `melee2.cmd`'s header claims
that fix is in. Raising the ceiling has not worked; the seat needs its reasoning
capped, not its budget raised.

### Instrument bug: the control fired 23 arrows and 29 went astray

`Iseabail: loosed 23, astray 29`. Astray exceeds loosed, so one of the two counters is
wrong, and she is the *control* — the seat every model comparison is measured against.

### What plainly worked, again

- **Speech.** 268 distinct lines, coordinating, naming people and places. Settled.
- **`plan`.** 7 of 7 model seats wrote one; Morag wrote 95 distinct plan lines.
  **`note` is still one model's habit** — opus-5 wrote the only note in the run,
  the same one as last check: *"Goblin roams NE of Rowan Moor. Don't go north alone."*
  Confirms A157's axis on a full run.
- **Carcasses and fires.** 8 kills, 9 `craft`, 11 `eat`; **41 fires** across ~24 game
  hours and 8 seats, against 106 pre-fix. Wood is not too scarce — single gathers of
  57, 40 and 31 branches are in the record.
- **No seat went `SPENT`.** Highest was Eachann at 142 of 250. **The run used 582 of
  4000 calls in 62 real minutes** — under a sixth of the budget.

---

## 2026-08-09 13:05 — A DEAL WAS STRUCK IN WORDS, DECLARED SETTLED BY BOTH SIDES, AND NOTHING MOVED

**What is actually running is not the duo roster.** The evaluation brief describes a
two-mind run on `roster-duo.json`; `duo2.jsonl` has been stale since 11:28. Live is the
8-seat melee, sampling to `melee3.jsonl`, **started 12:38:41 — sixty-nine seconds after
commit `8b38370`, "tell the mind that somebody is holding a deal open for it."** So this
is the first live look at that fix. 70 samples, 560 card-observations, 23 real minutes,
game hour 4.4, 216 of 4000 calls. **No seat is `SPENT`;** highest is Eachann at 52 of 250.

### The headline: Tormod paid nine times for venison he was told, four times, he had

Tormod (`grok-4.5`) and Eachann (`grok-4.20-0309-non-reasoning`) negotiated a complete
bargain out loud. Tormod's lines, in the order they appear:

> "wood for your fire, need meat" → "branches for meat, as you said" → "branches for meat,
> deal still stands" → "branch yours, hand the meat" → "here's wood, now the venison" →
> "wood as promised, venison now" → "wood as promised, hand over the meat" → "meat as
> agreed" → "meat as agreed, hand it over" → "aye, hand it over"

Eachann's side: *"one branch and I'll trade"* → *"deal, here's the venison"* → *"deal
done"* → *"here is the venison"* → *"fine, here's your venison"*.

**Eachann's entire deed record for the run is `gather ×23, place ×5, craft ×1, eat ×2`.
There is no `give` on it. Ever.** He cooked and ate twice. Tormod's record contains
`give ×9` — nine wood, every one to Eachann, h20.88 through h21.29 — and **no `eat`, no
`craft`, and a pack holding `bow ×1, wood ×6` and nothing else.** He paid nine times on
the strength of a sentence and received nothing, and the escalation in his own wording
("as you said" → "deal still stands" → "as promised" → "aye, hand it over") is a mind
noticing it is not being paid and having no verb that can do anything about it.

This is the first fraud in this world. It is not a model being deceptive so much as a
world in which **`say` costs nothing, binds nothing, and is never contradicted by the
ledger** — "here is the venison" and actually handing it over are indistinguishable to
everyone including us. Speech was turned on to make trade possible; on this evidence it
made trade *simulable* instead.

### Correction: `accept` HAS now been reached for. It still produces nothing.

The 12:35 entry said `accept` had never once been reached for. That is no longer true and
the record should say so. Two seats set it as a goal:

- **Eachann, h13.72** — `take Tormod offer`, why: *"get the branch I need"*
- **Tormod, h22** — `take Eachann offer`, why: *"starving need the venison now"*

And **five of seven model seats set an `offer` goal**: Tormod (*"offer branch to Eachann
for venison"*), Ailsa, Seonaid (*"hungry and shivering, must trade for food tonight"*),
Coinneach, and Tormod again to Morag. The verbs are being reached for by most of the
roster, in plain economic language, with correct target names.

**Deeds produced by `offer`: 0. By `accept`: 0.** In 560 card-observations the only
trade-family deed of any kind is Tormod's nine `give`s. The whole roster is now trying to
trade and the exchange still does not happen.

### `refusedVerbs` is `{}` on all 560 cards — and this is the run that proves A155

Fifth consecutive empty check, but now with teeth: **five seats reached for `offer`, two
for `accept`, and not one refusal was recorded.** `refuse()` fires only on name-or-noun
resolution failure and the names all resolved. The column cannot see this run's failure.

### The instrument that would settle it already exists and is not exported

`Agent.acted` (`src/net/agent.js:212`) is incremented at `agent.js:1333` at the exact
moment a verb's walk arrives and the act fires. `server/board.js:287` exports
`refusedVerbs` and **not `acted`**. So the board cannot distinguish *"the model never
chose offer"* from *"the model chose offer and the body never got there"* — which is the
only question that matters right now. See A164.

The likely answer, unconfirmed: `offer` returns `{x, z, within: REACH, act:'offer'}`
(`agent.js:2602`) — the body must physically arrive. The analyser reports **within 3 m in
3 of 50 comparable samples, mean separation 242 m.** A walk to a trading partner is long
and every new decision replaces the target. But that is a hypothesis and `acted` is how
you stop guessing.

### What plainly worked

- **`plan`: 6 of 7 model seats wrote one.** Morag 26 distinct, Fingal 14, Ailsa 7.
  The lone abstainer is Eachann (`grok-4.20`), `plan: []` and `note: ""` all run.
- **`note` is still one model's habit.** Morag (`claude-opus-5`) wrote the only three in
  the run — *"25 branches. No food. Trade fire for meat."* **Third run confirming A157.**
- **Speech is universal and coordinating.** Morag produced 29 distinct lines, every one a
  standing market offer pinned to a named place: *"Venison to the Rowan Moor fire — bring
  wood, take a cooked share."* The scripted control Iseabail said **nothing, ever** — the
  cleanest model-vs-script contrast in the file.
- **Fires: 19 `place` deeds** in 4.4 game hours across 8 seats (41 in ~24 h last run, 106
  pre-fix). The 10-branch cost is holding and nobody is wood-starved.
- **Carcasses:** 5 kills, 3 `craft`, 5 `eat`. The loop closes for those who hunt.

### Still broken, unchanged

- **Gold: 0 on all 560 card-observations. Eleventh consecutive check.** A151.
- **The kimi seats get a quarter of the turns again.** Coinneach 13 calls and Seonaid 13,
  against Eachann's 52 and Fingal's 41. **Coinneach shows two distinct intentions in the
  entire run.** The 8000-token cut-off did *not* recur; Seonaid's one failure was
  `This operation was aborted`. A160's cadence half stands, its token half may be fixed.
- **Fingal (`haiku-4.5`) at food 12**, the only seat in trouble; the rest sit 60–90.

---

## 2026-08-09 13:40 — THE RUN ENDED. 96 TRADE DECISIONS, ONE SETTLEMENT, AND THE BANKER ATE WHILE THE DEPOSITORS STARVED

**The run is over and was not restarted.** `127.0.0.1:8090` does not answer (only vite on
5173 is listening); `melee3.jsonl` stops at 13:19. This entry reads the **complete** file —
**122 samples, 976 card-observations, 40 real minutes, game hour 20.7, 400 of 4000 calls.**
The 13:05 entry saw the first 70 samples; everything below is the run's second half plus
whole-run totals, and it corrects that entry in three places.

### The headline number: 96 trade-shaped decisions produced ONE trade

Of **356 distinct `(goal, why)` decisions in the run, 96 — 27% — were trade-shaped.**
Split by verb, against the deeds they produced:

| decided | attempts | deeds produced |
|---|---|---|
| `offer …` | **45** | **0** |
| `take … offer` (accept) | **28** | **1** |
| `give … to …` | **23** | **26** |

**`give` is the only trade verb whose body works.** `offer` was reached for forty-five times
by four different models and has still never produced a deed of any kind. `accept` landed
**once in twenty-eight attempts.**

### The one that landed — and it is real

At **h18.56 both sides logged the same event:**

> Morag: *"I got wood from Tormod for venison_cooked"*
> Tormod: *"I traded wood to Morag for venison_cooked"*

`claude-opus-5` and `grok-4.5`, priced in words beforehand, settled reciprocally, both
ledgers moved. **This is the first reciprocal settlement in the melee** and it arrived after
commit `8b38370`. The fix works. It works 3.6% of the time.

### The Rowan Moor market: 26 payments in, one cooked share out

Morag (`claude-opus-5`) ran an actual standing market — **54 distinct lines, nearly every one
a posted price at a named place**: *"Venison to the Rowan Moor fire — bring wood, take a
cooked share."* / *"Bring your branches — I kill the south deer, fire tonight, all get a
cooked share."* Six seats converged on it in speech and in `plan`. Then:

- **Ailsa (`claude-sonnet-5`) paid fourteen times** — `give ×14` to Morag, **two wood and
  twelve arrows** — and finished at **food 23 carrying nothing but a bow**. She loosed 0
  arrows and killed 0 animals all run. *She sold her entire quiver to buy a meal that never
  came.*
- Seonaid gave 1, Tormod gave 9 (to Eachann, the fraud in the 13:05 entry).
- **Coinneach food 18, Seonaid food 24, Ailsa food 23.** Every seat that paid went hungry.
- **Morag finished at food 87, carrying `wood ×28, arrow ×9, hide ×5`,** having eaten 3 times.

Twenty-six `give`s went in and one cooked share came out. This is not a model being greedy —
Morag's own `note` reads *"25 branches. No food. Trade fire for meat."* and her final `plan`
is **`["haul venison back","cook, pay Coinneach Seonaid Tormod","camp here"]`** — she intended
to pay all three by name. **The world has a verb for handing goods over and no verb for
collecting**, so intent-to-pay and payment are the same object, and the run ends with the
debts unsettled inside a mind that meant to honour them.

### A coin was picked up. For the first time. The column still says 0.

**Eachann, h20.44: `{"what":"gather","id":"gold","n":1,"text":"I picked up a gold"}`.**

The `gold` field on that same card reads **0**, and reads 0 on all **976** card-observations,
and `gold` never appears in any `carrying` array. The gather deed only fires when the pack
actually rises (`agent.js:1730`), and `board.js:243` reads `a.carrying?.gold ?? 0` off the
same object that builds the `carrying` list.

**Correction to eleven runs of reading.** "Gold: 0 on every card" has been logged as evidence
that nobody can get gold. It is not: **gold is reachable, a mind reached it, and the instrument
did not move.** A151's *conclusion* may survive; its *evidence* does not. See A170.

### Eachann died and the board cannot say of what

Health **100 → 0 between h20.4 and h20.7**, with **food 66, wounds 0**, one sample after
killing a goblin (h19.59) and mid-loot on the goal *"pick up what is lying about"*, why:
**"free loot before goblins."** No death event, no cause, no killer, no `lastError`. The
single most consequential thing that can happen to a seat is invisible to the instrument.
See A171.

### Corrections to the 13:05 entry

1. **`accept` produces deeds after all** — one, at h18.56. That entry said zero.
2. **`plan` is 7 of 7 model seats, not 6.** Eachann was named the lone abstainer; he finished
   with **`["get meat","trade wood to Morag for cooked venison"]`**. Six of the seven final
   plans name trade. Morag wrote **87 distinct plan lines**, Fingal 44, Ailsa 15.
3. Tormod's nine `give`s are **earlier** than Ailsa's fourteen, not later — game hours wrap at
   24 and sorting the ledger by `h` reverses days. Sample index is the only safe ordering.

### Unchanged, and now well-attested

- **`refusedVerbs` is `{}` on all 976 card-observations.** Sixth consecutive empty check, with
  **73 `offer`/`accept` decisions producing nothing and not one refusal recorded.** A155 holds.
  **A164 is still unbuilt** — `acted` does not appear anywhere in `server/board.js`.
- **`note` remains one model's habit.** Morag (`opus-5`) wrote all three in the run; every
  other seat is `""` for all 122 samples. **Fourth run confirming A157's `note` axis** — but
  see correction 2, the `plan` half of A157 is now dead.
- **The arrow counters disagree again, and not on the control this time: Morag loosed 5,
  astray 13.** A161 is an engine bug, not a scripted-seat quirk.
- **No seat went `SPENT`.** Highest was Eachann at 95 of 250; the run spent **400 of 4000
  calls in 40 minutes**. A163 stands — budget is not the constraint.
- **kimi cadence, third confirmation:** Coinneach 25 and Seonaid 24 calls against Eachann 95,
  Fingal 76, Tormod 63, Ailsa 63. Coinneach managed **4 distinct plans and 13 sentences** all
  run. A167.
- **Fires: 31 `place` deeds** across 8 seats in ~20 game hours (41 last run, 106 pre-fix).
  Wood is not scarce — Coinneach picked up **58 branches in one gather**. The 10-branch price
  is correct and settled; stop re-checking it.
- **Speech: 218 distinct lines across 7 model seats. The scripted control said nothing, ever.**

## 2026-08-09 14:05 PDT — THE BOARD IS DOWN. And the one number this file has leaned on hardest — "how far apart were they" — can be moved from 0% to 34% by changing how you read it

**The run is over.** `http://127.0.0.1:8090/board.json` refuses the connection (curl exit 7,
no HTTP status). Per standing orders it was **not** restarted. The Vite dev server on :5173 is
still up and reloading `src/main.js`, `src/loop.js`, `src/items/inventory.js` and
`src/items/registry.js` between **13:25 and 13:42** — the world was stopped so the code could
be worked on, which is the expected end, not a crash. **No samples exist after `melee3.jsonl`
at 13:19.** The 13:40 entry already wrote this run's ending up and nothing below contradicts it.

### The eval task points at the wrong file, and describes a world that no longer exists

The scheduled task names `duo2.jsonl` and a **two-mind roster** — Eachann on
`grok-4.20-0309-non-reasoning`, Coinneach on `kimi-k2.6`, "two minds, no scripted control."
`duo2.jsonl` in fact holds an **eight-seat melee** (Morag, Eachann, Tormod, Coinneach, Seonaid,
Ailsa, Fingal, Iseabail — one of them the scripted control), and it is **stale: last written
11:28**, superseded by `melee2.jsonl` (12:32) and `melee3.jsonl` (13:19). A run that reads only
`duo2.jsonl` grades a world four hours dead. See A175.

Its priority list is stale too — it asks whether `plan`, speech, trade and `accept` have ever
been seen working, and all four were answered in the 10:35–13:40 entries.

### The distance figures in this file are not measurements. They are one arbitrary reading of an ambiguous string

The board gives position as prose: `"323 m north-west of Broad Loch"` — a landmark, an
**8-point** bearing, and a range. Reconstructing polar coordinates from that and taking the
Euclidean distance, across **all 28 seat-pairs** in melee3 (the analyser only ever compares
two), gives:

> 806 shared-landmark pair-observations · within 140 m: **517 (64.1%)** · within 3 m: **271 (33.6%)**

That reads as a world where minds are constantly in each other's laps and trade fails purely
for mechanical reasons. Now the same data under a bound that **cannot** be wrong — separation
is at most `r1 + r2` whatever the bearings are, so `r1 + r2 ≤ 3` proves trade range:

> **provably within 140 m: 0 of 806. Provably within 3 m: 0 of 806.**

Both numbers are honest. The first assumes the bearing bucket is the true bearing; at 250 m a
45° bucket is a **~200 m wide arc**, so it is assuming away the entire quantity being measured.
The second is rigorous and useless — it can only fire when both seats are nearly standing on
the landmark. **The truth is somewhere in a 0–34% band and the board cannot narrow it.**

Every "they met" / "they never met" claim in this file rests on a quantity the instrument does
not carry. **Nothing here says the minds were far apart — it says we have never once known.**
See A174.

### Three counting caveats settled, one of them against me

- **`said` is capped at 3** — 3,164 of 4,160 cards across melee3, melee2 and duo2 sit at
  exactly 3, and **not one card in any log has 4**. But the window **never once turned over
  completely** between consecutive samples (**0 of 733, 0 of 1,167, 0 of 1,020**). At 20 s
  sampling no sentence was lost: **the 217 / 266 / 271 distinct-sentence counts stand.**
- **`deeds` is the documented 5-window, and it cost nothing here** — full-window deed lists
  entirely replaced between samples: **0 of 439** in melee3. The 13:40 give/trade counts are
  not undercounts.
- **Correction, mine, same session: `carrying` is NOT capped at 5.** melee3 maxes at 5 stacks
  and 67 cards sit there, which looked like a cap and would have invalidated every inventory
  claim in this file. **`duo2.jsonl` has a card carrying 6.** No cap. The inventory readings
  are fine; I nearly filed a bug against a coincidence in a single log.

### `refusals` is the archery log, not the verb log — `refusedVerbs` really is empty

`refusals` sits at its 4-deep cap on **556** melee3 cards while `refusedVerbs` reads `{}` on all
976, which looked like a populated sibling shadowing a broken aggregator. It is not: `refusals`
holds **shot** rejections — `{"d":29,"why":"too far","slant":34.9,"dy":-5.8,"leadBy":5.9}`,
`{"d":20,"why":"ground in the way 11 m out"}` — 138 distinct entries, Iseabail alone 80.
**A155 stands unchanged and this is the seventh empty check.**

## 2026-08-09 14:35 PDT — A BUG THIS FILE MARKED FIXED WAS NEVER TOUCHED: `avoid` still cannot see the thing it is fleeing

**Still no run.** `board.json` refuses the connection at 14:31 (curl exit 7, no HTTP status);
only `:5173` is listening. `melee3.jsonl` (13:19) is still the newest sample file — nothing has
been written since. Not restarted, per standing orders. Everything below is re-reading logs
that already exist, plus the source.

### Correction to the 13:37 entry, and it reopens a live bug

Line 4909 of this file says of the two bugs `refusedVerbs` caught:

> "…were both *resolution* failures, and **both were fixed at `9ba2a4f`**."

**One of them was.** `git show 9ba2a4f` touches only price/noun resolution — its own message is
entirely about `resolveItemId` and `'branch'`/`'branches'`. It does not contain the string
`avoid`, `140`, or `noticeRange`. And [agent.js:2788](src/net/agent.js:2788), the `avoid` case,
has not been modified since **`ed78363` (08-08 15:30)** — the commit that *added* the
instrumentation that found it. The flee bug was reported, written up as closed, and never fixed.

The disappearance of Ailsa's `avoid: 24` after duo2 is **not** evidence of a fix. In `melee2`
and `melee3` `refusedVerbs` is `{}` for *every* verb on *every* card; `avoid` vanished along
with everything else. Meanwhile minds kept reaching for it — "keep away from a goblin" appears
as a goal **8 times in duo2, 2 in melee2, 7 in melee3**.

### The two social verbs use opposite lookups, and both are wrong in opposite directions

```
avoid   agent.js:2789   find(...)     → nearestOf(pred, false)  → CONTACTS, culled at 140 m
accept  agent.js:2562   anyone(...)   → the unculled snapshot
```

- **`avoid` refuses a threat it can see.** Past 140 m `find` returns nothing, so a mind that
  says *"keep away from the goblin"* gets `refuse('avoid')` **and then `this.roam()`** — it
  wanders at random instead of fleeing. Ailsa paid this 24 times in one run.
- **`accept` never refuses at all**, because `anyone()` always finds the counterparty — which
  is the mechanism at line 3730 that let Coinneach hold `take Eachann offer` for 53 samples
  and starve to death against a partner he could not reach.

Same class of bug, same file, opposite sign. Fixing them together is one edit each and they
should not be filed apart. **A177.**

### `note` is a one-model field: 1 seat in 7 has ever written one

Across **520 samples and three runs**, exactly one seat has ever put a word in `note`:

| run | who wrote a note | who did not |
|---|---|---|
| duo2 | Morag (`claude-opus-5`) — 1 | the other 7 seats |
| melee2 | Morag — 1 | the other 7 |
| melee3 | Morag — 3 | the other 7 |

Never `claude-sonnet-5`, never `grok-4.5`, never `grok-4.20`, never `kimi-k2.6` (×2), never
`haiku-4.5`. Contrast `plan`, which **every** model seat writes in **every** run (A173):
melee3 is Morag 45, Fingal 20, Ailsa 9, Tormod 3, Coinneach 2, Seonaid 2, Eachann 2 distinct.

So this is not "models don't use scratchpads" — it is something specific to `note`. And the
one model that does use it uses it two different ways: as a warning that outlives the danger
(*"Tormod and Ben dead to goblins north-east. Do not go that way."*, *"Goblin roams NE of Rowan
Moor. Don't go north alone."*) and, in melee3, as a **state scratchpad it rewrites** —
`"No food, no wood. 12 arrows. Deer NW."` → `"16 branches. No food. Trade fire for meat."` →
`"25 branches. No food. Trade fire for meat."`. That is a mind keeping its own books because
nothing else does. **A178.**

`a062c7c`'s *"`note` is not dead, it is unverified"* stands, with the sample size now named:
n = 1 model.

## 2026-08-09 15:10 PDT — A RUN CAME BACK AND A HOT RELOAD KILLED IT AT FIVE GAME HOURS. And `refusedVerbs` is not broken — it is reporting a true zero, which reframes A177

**The board answers again.** The 14:05 and 14:35 entries ("the board is down", "still no run")
are stale from 14:41 onward. The live run is the **melee roster** — 8 seats, 6 models — not
`roster-duo.json`, which this task file still describes. No sampler was attached to it, so I
sampled `board.json` myself every 20 s.

### The run was destroyed mid-sample, and the killer is in the vite log

| sample | game hour | total calls | per-seat calls | food |
|---|---|---|---|---|
| 0 | 4.6 | 216 | 29,52,34,13,13,34,41,0 | 66,61,73,57,75,81,76,75 |
| 1 | 4.9 | 220 | 30,52,35,13,13,35,42,0 | 65,60,72,56,74,80,74,74 |
| 2 | 5.2 | **221** | 30,53,35,13,13,35,42,0 | 63,58,71,54,73,79,72,73 |
| 3 | 7.5 | **0** | 0,0,0,0,0,0,0,0 | **51,51,51,51,51,51,51,51** |

Every counter zeroed and all eight larders reset to the spawn value inside one 20 s window.
`m-web.log`'s last line is `3:00:33 PM [vite] page reload src/main.js`, and the working tree
has uncommitted edits to `src/main.js`, `src/sim/world.js`, `server/packcheck.js`. **Editing the
source ends the world.** This is the reason no run in this file has ever reached a long horizon:
the fixes cannot be observed over hours because the act of working on them wipes the subject.
**A179.**

### Every API failure mode from duo2 is gone

duo2 had Fingal (`haiku-4.5`) at **0 answered / 152 failed** on `http 400`, and both kimi seats
at 27/23 and 12/38 failed on `no json in reply`. In this run, across 221 calls: **zero failures
on every seat.** Fingal answered 41 of 41 and spoke seven distinct sentences; in duo2 he said
`— nothing, ever —`, and that silence was the HTTP error, not the model. No `SPENT` tag
appeared; the busiest seat was 53 of 250. **Speech is no longer the open question — 7 of 7
model seats talk, constantly.**

### `refusedVerbs` works. The zero is real.

`npm run feedbackcheck` is **20/20**, including *"…and it is COUNTED, so a refused verb stops
looking like an unwanted one — `{"offer":1}`"*. The counter is never cleared, so a run-long `{}`
means no verb was ever refused. Populated in duo2 and melee; **empty on every card in melee2
(176 samples), melee3 (122) and this run.** That is a behaviour change, not a dead column, and
the 14:35 entry's implication that `avoid` "vanished along with everything else" was too quick.

### A177 sharpened: the `avoid` bug fires exactly when fleeing SUCCEEDS

The source read stands — [agent.js:2789](src/net/agent.js:2789) still uses a bare `find()`
while the `make for` case **four lines above at :2781** already reads
`find(...) ?? anyone(...)`. But the bug is rarer than "past 140 m", because a mind can only
*name* a goblin it was shown, and the brief culls at the same 140 m. At the moment of choosing,
the target always resolves.

It fires on the **next** tick. You flee, the goblin drops past 140 m — and the verb that saved
you now refuses and hands you `this.roam()`. Ailsa's `avoid: 24` in duo2 is one successful
escape followed by 24 decisions of random walking beside the thing she escaped. It also explains
the true zero here: a melee is crowded, so threats stay inside 140 m and `avoid` never has to
reach. **The fix is unchanged and now has a stronger reason: remember where you last saw it.**

### Correction to A178 — `note` is not a one-model field

A178 said, on 520 samples, that only `claude-opus-5` has ever written a `note`, "never
kimi-k2.6". **In five game hours Seonaid (`kimi-k2.6`) wrote one**, and a good one:

> `"Fingal, Eachann, Tormod quarrel over western deer — keep clear"`

alongside Morag's `"Everyone chasing deer, nobody laying in firewood. That's my edge."` Two
models, not one. A178's *fix* still stands; its headline number does not.

### Trade is in every plan and in none of the goals

Five of seven seats wrote a trade into `plan` — Morag `"sell arrows and firewood for venison"`,
Fingal `"trade hides for arrows"` / `"pay Coinneach"`, Tormod `"trade arrows for meat"`,
Coinneach `"owe Morag meat for arrows"` / `"pay the debt"`, Ailsa `"trade if safe"` — and they
said it aloud: *"Morag, I owe you meat. Need arrows now."* Across **221 decisions not one
`offer`, `accept`, `give` or `take` goal was emitted.** Every goal was `gather`, `make for`,
`hunt`, `avoid` or `go for goblin`. The plan field holds the intention across ticks; the goal
field never converts it. **A180.**

### There is no player called Ben

Minds address one constantly — *"Ben — Morag's in, bring the venison here"*, *"no arrows to help
Ben"*, and in duo2 *"Tormod and Ben dead to goblins north-east."* The roster is Morag, Eachann,
Tormod, Coinneach, Seonaid, Ailsa, Fingal, Iseabail; "Ben" appears in `roster-melee.json` only
inside a cost comment. `Beinn` is a summit word in [placenames.js:43](src/world/placenames.js:43)
and the map has a **Hollowed Beinn**. They have invented a man out of a mountain, promised him
arrows and reported him dead. **A181.**

### Wood is still not scarce

At 10 branches a fire, five of eight seats still laid one within their last five deeds — nine or
more fires in five game hours. Seonaid was carrying 32 branches, Morag 42 in duo2, and Ailsa
picked up **61 in a single action**. The price rise did not make fuel a constraint; it made it
a formality.

## 2026-08-09 15:35 PDT — TRADE IS NOT DEAD, IT WORKED TWICE — AND THE `give` VERB EMPTIES YOUR PACK OF THE WRONG THING

The board answers. A **fresh** run started at 15:03 (server pid 36284, `npm run agents` 15:03:34)
on the **melee** roster — 8 seats, 6 models, plus scripted Iseabail — not `roster-duo.json`,
which this task file still describes. It survived to **13 game hours**, the longest yet. I
sampled `board.json` every 20 s myself (`eval28.jsonl`, 17 samples); no `SPENT` tag appeared,
the busiest seat is 71 of 250, so **everything below is the models, not the fallback brain.**

### A180 IS WRONG. Trade verbs are emitted, and two trades have settled.

The 15:10 entry said *"across 221 decisions not one `offer`, `accept`, `give` or `take` goal was
emitted."* That was one 5-hour window. Re-reading **melee3 (122 samples)** with a verb-matcher:

| seat | model | trade goals |
|---|---|---|
| Ailsa | claude-sonnet-5 | 6 (`offer` ×2, `give` ×4) |
| Tormod | grok-4.5 | 4 (`offer` ×2, `give`, `take`) |
| Seonaid | kimi-k2.6 | 3 |
| Eachann | grok-4.20 | 1 (`take Tormod offer`) |
| Morag | claude-opus-5 | 1 (`take Tormod offer`) |
| Coinneach | kimi-k2.6 | 1 |

**Six of seven model seats reached for a trade verb**, and the deed log carries **24 `give`s and
2 `trade`s** — a genuine bilateral settlement recorded from both sides at h18.56:
`Tormod: "I traded wood to Morag for venison_cooked"` / `Morag: "I got wood from Tormod for
venison_cooked"`. The task file's *"`offer`, `accept`, `give` have never once been used by a
real model"* is out of date, and so is A180. **The verbs work. What follows is why they still
shouldn't be trusted.**

### A182 — `give a branch` when you have no branches hands over your ARROWS, one per tick, until the pack is empty **[S]**

[world.js:983](src/sim/world.js:983), `giftFrom`, resolves what to hand over in three steps:

```
1. the item you named, if you hold it        ← correct
2. else: the first EDIBLE thing you own      ← your food
3. else: your LARGEST STACK                  ← your quiver
```

Ailsa (`claude-sonnet-5`) in melee3, goal `"give branch to Morag"` — said aloud, *"here's my
branch, Morag"* — **holding no branches.** Her inventory, traced sample by sample:

```
h12.1  bow:1 arrow:12 wood:30      ← she had wood, and gave it
h13.0  bow:1 arrow:10
h13.3  bow:1 arrow:4
h13.7  bow:1 arrow:2
h18.6  bow:1                        ← a bow and nothing else, for the rest of the run
```

The deed log reads `I gave wood to Morag` ×2 then **`I gave arrow to Morag` ×9**. Tormod did the
same to Eachann — nine `give wood` deeds at h20.88→21.29, one every 3 game-minutes. It repeats
because `resolveGive` is edge-detected on the **recipient's name only**
([world.js:1370-1378](src/sim/world.js:1370)) while the agent clears `i.giveItem` every frame
([agent.js:1349](src/net/agent.js:1349)) — the edge re-fires for as long as the goal stands.

So one intention to hand over **one branch** cost a model its entire quiver. It looks like
generosity in the log; it is the instrument disarming the player. The fallback was written so
`give` would never silently do nothing — but the priority is exactly inverted: it substitutes
the most valuable thing you own for the cheapest thing you offered, and the food branch gives
away the one item a starving mind must keep.

**Fix:** if the named item is not held, `refuse('give', "you have no branches")` and count it —
that is what `refusedVerbs` is for. Never substitute. Separately, clear the goal on the first
successful gift. **Two small edits, and they are the difference between a market and a mugging.**

### The live run: three offers, none landed, and nobody is eating

Across 13 game hours and 17 samples, **3 `offer` goals and zero `accept`, `give` or `trade`
deeds.** All three were reached for by different models and all three ask for the same thing:

- Morag (opus-5): `offer arrow to Coinneach for venison` — *"Coinneach, five arrows for a cut of venison"*
- Coinneach (kimi): `offer branch to Tormod for venison` — *"one branch for your carcass — I owe you more if need be"*
- Ailsa (sonnet-5): `offer branch to Fingal for venison` — *"branch for a share of that deer, before dark"*

Every one asks for **raw `venison`**. melee3's two *settled* trades asked for **`venison_cooked`**.
Nobody in this run is carrying raw venison — Seonaid cooks hers on the spot. Worth a check, not
yet a finding.

Meanwhile the larder: `deeds` over the whole window are `gather:39, place:16, craft:3, killed:1,
eat:1`. **One eat, in thirteen hours, across eight people.** Food at the last sample —

```
Seonaid 100  Eachann 51  Coinneach 46  Iseabail 39  Morag 37  Ailsa 34  Tormod 18  Fingal 17
```

Seonaid (kimi) is the only seat that closed hunt → cook → eat, and it took her from 46 to 100 in
one action. Tormod has **2 kills and food 18**; Fingal has **1 kill and food 17**. They kill and
walk away from the carcass.

### A183 — a quiver holds 12 arrows and a kill costs 17 **[M]**

| seat | loosed | astray | kills |
|---|---|---|---|
| Tormod (grok-4.5) | 24 | 21 | 2 |
| Seonaid (kimi) | 18 | 17 | 1 |
| Fingal (haiku-4.5) | 11 | 10 | 1 |
| Coinneach (kimi) | 8 | 4 | 0 |
| Eachann (grok-4.20) | 6 | 3 | 1 |

**69 loosed, 56 astray — 81% miss — for 5 kills. 14 arrows a kill, against a starting quiver of
12.** No mind can feed itself from spawn without first finding arrows on the ground, which is
what the whole board is actually doing: `gather` is 39 of 60 deeds. This is the root of the
food collapse above, and it is why A182 matters — losing a quiver to a bad `give` is losing the
ability to eat. Either the shot solver improves or a kill has to cost fewer arrows.

Notably **Morag (opus-5) and Ailsa (sonnet-5) have loosed 0 arrows between them** and have 0
kills. Both chose the social economy — Morag is a fire-merchant with **101 branches**, plan
`["hold fire, 77 branches", "arrows only for meat", "charge warmth in venison"]` — and both are
starving on it (37 and 34, falling) because the counterparties never transact. **The two seats
playing the intended game are the ones the broken verbs punish.**

### The small columns, honestly

- **`refusedVerbs`: one event in 17 samples** — Tormod `{"follow":1}`. First non-empty card in
  three runs, so A177's "true zero" reading holds and the column is alive. It is still telling
  us almost nothing, because A182's `give` never refuses — it substitutes.
- **`note`: 1 seat in 8**, still Morag, and a third use for it — a **credit ledger about other
  people**: `"Fingal owes me a cut if he uses my fire. Coinneach owes branches."` A178's fix
  stands.
- **`plan`: 8 of 8 model seats**, 2–7 distinct lines each. Universally adopted, still inert.
- **Speech: 7 of 7 model seats, 3–11 distinct lines each.** Settled question; stop re-asking it.
- **Wood is not scarce.** 16 fires at 10 branches = 160 burned, and Morag *gained* to 101 while
  four seats hold 47+. The price rise did nothing.
- **kimi-k2.6 is a third of a player.** Both kimi seats: 17 calls to the others' 47–71, and
  **2 failures each (12%)**. Every other model is 0 failures. The 75 s cadence is not a style
  choice at this point, it is a handicap.

## 2026-08-09 15:58 PDT — ADDENDUM, AND I WAS TOO QUICK AGAIN: A TRADE SETTLED BETWEEN TWO MODEL FAMILIES, NEGOTIATED IN SPEECH

The sampler ran to 60 samples (`eval28.jsonl`, **120 samples, 22 game hours**). Three claims in
the 15:35 entry above were written off a 13-hour window and do not survive the full run. The
entry stands as written; these are the corrections.

### 1. "3 offers, none landed" — WRONG. One landed, and it is the best moment in this file.

```
h16.78  Morag  (opus-5)   offer cooked venison to Ailsa for 10 arrows
                          "Ailsa, cut's waiting at my fire — ten arrows, as you said."
h17.44  Ailsa  (sonnet-5) take Morag offer
                          "ten arrows, deal"
                          why: "hungry, keeping arrows was never the priority, food is"
h17.46  DEED   Morag      I traded venison_cooked to Ailsa for arrow
        DEED   Ailsa      I got venison_cooked from Morag for arrow
```

Both ledgers agree to the item: **Morag arrow 21→31, venison_cooked 1→0. Ailsa arrow 12→2,
food 22→56.** Ten arrows for one cooked cut, +34 food to the buyer.

Read the words, not just the deed. Morag says *"as you said"* — she is closing a price agreed in
earlier speech. Ailsa answers *"ten arrows, deal"* and gives a reason that is pure economics:
*keeping arrows was never the priority, food is.* This is **offer → accept → settle, negotiated
aloud, across two different model families**, and nothing in this file has shown it before. The
run total is 5 offers, 1 take, 1 settled trade.

### 2. "One eat in thirteen hours" — that was a trough, not a trend.

Final: `gather:202 place:36 craft:7 killed:5 eat:4 trade:2`. Food at h4.5 —

```
Iseabail 82  Eachann 79  Tormod 77  Coinneach 60  Fingal 57  Morag 52  Seonaid 48  Ailsa 17
```

Everyone recovered except Ailsa. The 13-hour reading caught a hungry stretch and I wrote it up
as a property of the world. It was weather.

### 3. A184 is half wrong — Morag did not starve on principle, she started hunting

I wrote that the two seats playing the social game were the two starving. **Morag abandoned the
pure-merchant line**: she has **16 arrows loosed and 2 kills** on the full run, cooked at h15.6
and went food 29 → 96 in one action. The seat that plays the intended game *and* hunts is the
richest on the board.

**Ailsa is the one the harness killed.** She loosed **0 arrows in 22 game hours**, made 0 kills,
and her one economic act was to pay 10 of her 12 arrows for a single meal. Food 22 → 56 at
h17.5, then straight back down to **17** over the next eleven hours, carrying two arrows and no
wood. She bought one dinner with her entire capacity to ever feed herself again — and by A183's
arithmetic (14 arrows a kill) ten arrows was worth roughly *nine hundred* food, not thirty-four.
**She was not wrong to trade. She had no way to see the price.** A184 amended: it is not that
social play is punished, it is that **nothing in the brief tells a mind what its goods are worth.**

### 4. A185 sharpened — this is not "wood is abundant", it is a MONOPOLY

Wood held at the last sample:

```
Morag 117  |  Tormod 8   Seonaid 8   Coinneach 7   Fingal 1   Eachann 0   Ailsa 0   Iseabail 0
```

**One seat holds 117 branches; the other seven hold 24 between them.** Morag peaked at 155 and
gathered through the entire run — her `plan` was rewritten **47 distinct times** (Eachann: 2).
36 fires were lit and she funded most of the map's warmth. So the 10-branch price *did* bite —
just not for the one player who saw it coming a day early. That is a working economy, and the
fire-merchant strategy is economically real. It is the first genuine capital position this world
has produced, and it should be celebrated rather than balanced away.

## 2026-08-09 16:08 PDT — THE RUN NEVER ENDED. FIFTEEN MORE GAME HOURS, AILSA GOT 65 FOOD FROM NOWHERE, AND A188 DIED IN NINE

**Instrument note first, because the scheduled task is pointed at the wrong run.** The task file
still names `roster-duo.json` / `duo2.jsonl` — two minds, Eachann and Coinneach. That is not what
is live. The board at `127.0.0.1:8090` is the **seven-model melee plus Iseabail the scripted
control** (`roster-melee.json`), and `duo2.jsonl` has not been written since 11:28. I sampled a
fresh window into **`eval29.jsonl` — 19 samples, `at` 2668 → 2944**, picking up where
`eval28.jsonl` stopped at `at=2228`. **No `SPENT` tag on any seat**: 617 calls of 4000, 1.03 M
tokens in, every seat still its own model. Nothing below is the scripted brain.

### `h` wraps at 24 and nothing anywhere records the day — the 15:58 entry read a sunrise as an ending

The addendum above reports "final" figures at **h4.5**. That was not the end of anything; it was
the next morning. The board carries exactly one monotonic clock — `at`, in seconds, on the board
object — and **`hours` on every player card is hour-of-day, 0–24, which wraps.** `deeds` and
`intentions` are stamped with `h` and nothing else, so **you cannot order two events across a day
boundary, and a deed from yesterday sorts in front of one from this morning.** Every "final" table
in this file that was read off `h` is suspect for the same reason. The run has since gone on to
h19.2 at `at=2944` — a further **fifteen game hours** past where the last entry stopped.

### Ailsa gained 65 food while doing nothing at all, and I think the harness killed her

This is the most important number in the run. Ailsa's food, traced sample by sample across both
logs:

```
at=2228  h4.5   food 17   arrow 2   deeds: 18.45 place, 21.68 place, 17.46 gather, 17.46 trade, 17.46 eat
   ...   (unobserved gap, 383 board-seconds)
at=2611  h12.4  food 82   arrow 2   deeds: 18.45 place, 21.68 place, 17.46 gather, 17.46 trade, 17.46 eat
```

**Her deed window is byte-identical on both sides of the jump.** Her inventory is unchanged — two
arrows, no wood, no venison. No `eat`, no `gather`, no `trade`. Every other seat decayed normally
across the same gap (Eachann 79→51, Tormod 77→51, Coinneach 60→34, Seonaid 48→18, Fingal 57→30,
Iseabail 82→52 — all about −28). Morag gained too, and she has the `craft` and `eat` deeds to show
for it. Ailsa gained 65 with nothing.

`VITALS.hungerStart` is **85**. Her observed peak is **82**, three points of decay below it, and
her health reads 100. `VITALS.respawnDelay` exists and `server/deathcheck.js` documents a history
of respawn loops. The reading I cannot prove but would bet on: **she died in the gap and the
respawn handed her a full stomach.** I did not see it, and I am flagging it rather than asserting
it — but note what makes it unfalsifiable from here: **the player card has no death field.** The
keys are `health, food, wounds, kills, loosed, astray`; `kills` is kills she made, `wounds` is
wounds she dealt. Nothing counts times you died, health heals back to 100, and every seat on the
board reads hp=100 right now. A seat can die repeatedly and the instrument shows a healthy player.

**This inverts the 15:58 story.** That entry's headline was that Ailsa paid ten of her twelve
arrows for one meal and then starved from 56 down to 17. The price analysis in A187 stands and is
still the best economic observation in this file. But she did not starve — she was handed 65 food
for free, and she is on 59 now, still with **0 arrows loosed in thirty-odd game hours**. Worse,
`hungerDamageBelow: 0` means hunger *never* deals damage. Seonaid is on **food 1** and in no danger
whatever. Starvation in this world currently has no teeth at all, and dying may be the cheapest
meal in the game.

### A188 — "the first real capital position, do not nerf it" — lasted nine game hours

Wood then (15:58 entry, `at=2228`) against wood now (`at=2944`):

```
              Morag  Eachann  Tormod  Iseabail  Coinneach  Seonaid  Fingal  Ailsa
15:58 entry     117        0       8         0          7        8       1      0
now             260      271     182        17          7        2       1      0
```

**Eachann and Tormod did not break the monopoly by dealing with the monopolist — they walked off
and picked up their own.** Three seats now hold 713 branches between them. A188 said the 10-branch
fire "did bite, for everyone except the one player who saw it coming"; nine game hours later two
more players saw it coming and the corner evaporated. **A185 was right the first time and A188 was
wrong: wood is not scarce, it is effectively unlimited, and a hoard of it is not a capital position
because anybody can mint one by walking.** I am marking A188 superseded rather than deleting it —
the *shape* of the idea (a monopolist with running costs would be interesting) is still worth
building; it just was not what was happening.

### The trade mechanism, finally caught in the act: **both sides offer, nobody accepts**

Twelve distinct trade intentions across five seats, and **exactly one settled trade in the whole
run.** Here is why, and it is not the models' fault. Tormod advertised the same deal to Fingal
three times:

```
h11.95 Tormod  "offer cooked venison to Fingal for arrow"      why="loot his arrows cheap"
h13.68 Tormod  "offer cooked venison to Fingal for arrows"     "venison for twenty arrows, fair?"
h14.32 Tormod  "offer cooked venison to Fingal for 20 arrows"  "venison for twenty arrows, fair?"
```

Morag heard him and answered — with the right price, in the right words:

```
h17    Morag   "offer 20 arrows to Tormod for venison"   why="take his deal, food first"
               said="Tormod — twenty arrows for the venison, done. Sunny Rigg after, I'll cook."
```

She says *"done"*. She means yes. **She used `offer`, not `accept`** — so what the world now holds
is two standing offers pointing at each other, mirror images at an agreed price, and no trade. The
one settlement that ever happened is the one where a mind wrote the literal verb: Ailsa's
`take Morag offer`, *"ten arrows, deal"*.

And the failure is silent. `World.resolveAccept` (`src/sim/world.js:874`) has **six bare `return`
paths** — giver gone, no matching offer, out of `giveRange`, a `KEEP_ON_DEATH` item, giver short,
taker short — and not one of them pushes an event, calls `refuse`, or notes an outcome.
`agent.js:2737` only refuses `accept` when the *name* fails to resolve. So a mind that reaches for
a deal and is turned down by the world is told nothing, and `refusedVerbs` never counts it.

**The standing-offer fix works** — `me.of` rides with health and hunger (`world.js:1640`), and it
is demonstrably what let Ailsa answer at all, the first time that path has fired in a live run. It
is the *settlement* half that is missing.

### The written characters are the result of this run, and the board hides them

Every model seat is playing its `character` from `roster-melee.json`, visibly, in behaviour and not
just in words:

- **Eachann** (*"You hoard… what you pick up is yours"*) — 271 branches, and every line he speaks is
  a claim: *"that one north is mine"*, *"that carcass is mine now"*, *"those are mine now"*.
- **Tormod** (*"You promise easily and deliver when it suits you… good at sounding like the
  reasonable one"*) — says *"venison for a few arrows, fair?"* while his own `why` reads
  **"loot his arrows cheap"**. The speech is reasonable and the reason is predatory. Exactly as written.
- **Seonaid** (*"you offer a way to split it"*) — *"Eachann, Fingal — split this kill and be done"*,
  *"split it and keep the peace"*.
- **Ailsa** (*"careful to the point of timid… rather go hungry than take a risk"*) — **0 arrows
  loosed in thirty game hours**, plan `["stay near fire, away from goblins"]`. She played it to the
  point of destitution.
- **Morag** (*"set something up now that pays tonight… say what you are doing so people can fall in
  with it"*) — the fire-merchant, the only `note` on the board, and she announces every move.

Two caveats, honestly. Coinneach's *"rather owe than starve"* is near-verbatim from his character
text, which is echo, not evidence. And Ailsa's and Seonaid's are the strong cases precisely because
they are *behavioural* — a refusal to ever shoot, and an unprompted offer to split a kill.

Now the instrument problem: **`persona` reads `null` on all eight cards.** That is deliberate —
`server/agents.js:189` sets `persona: ROSTER.players[i]?.character ? null : cast[i]`, so writing a
character by hand switches the persona tag off. `server/board.js:203` says the character hangs off
the tag because *"the whole point of a persona run is attribution"* — and the hand-written path,
which is the one anybody actually uses for a melee, is the one that loses it. **The single most
successful thing in this run is invisible on the instrument built to show it.**

### The small columns

- **`refusedVerbs`: still exactly one event, ever** — Tormod `{"follow":1}`, unchanged across both
  logs. Given the six silent returns above, this column is not measuring refusals; it is measuring
  the small subset of refusals somebody remembered to instrument.
- **`plan`: 7 of 7 model seats, 0 of 1 scripted.** A clean control signal — Iseabail leaves it
  empty, so a populated `plan` really is a model writing. Still no evidence any of it is *read*.
- **`note`: still 1 seat in 8**, still Morag, still the same credit ledger — *"Fingal owes me a cut
  if he uses my fire. Coinneach owes branches."* Three runs, one user.
- **kimi's failures name their own cause on the card.** Both kimi seats carry
  `lastError: "reply cut off at 8000 tokens — raise maxTokens for this seat"`. **A186 called this
  "a real error rate"; it is a config line.** `roster-melee.json` gives them `maxTokens: 8000` and
  kimi's reasoning eats the budget before the answer arrives — `roster-kimi.json` already learned
  this and writes 3000 with a comment about it. The cadence half of A186 stands (36 calls against
  Eachann's 145); the reliability half does not. **Fifth time the instrument has been mistaken for
  the model.**
- **Speech: 7 of 7 model seats, 0 of 1 scripted.** Settled; stop re-asking.

---

## 2026-08-09 16:45 — starving to death is free, and I watched it happen twice

**Which run this is.** The scheduled task still describes the two-mind duo (`roster-duo.json`,
`duo2.jsonl`). That is not what is running. `duo2.jsonl` last grew at **11:28**, five hours ago.
The live world is the **eight-seat melee** off `roster-melee.json` — seven model seats and
Iseabail scripted — sampled into **`eval28.jsonl`**. Everything below is that run.

Two instrument notes first, because both cost me time:

- **`eval28.jsonl` stopped at 15:52** and the board is still live at 16:45. `samp28.mjs` has
  `if (n < 60)` hard-coded, so the sampler retires after 60 samples — **20 real minutes** — and
  the world ran on for another hour unobserved. Every "final" number below that needed more than
  20 minutes I took from the live board directly.
- **`samp28.mjs` writes `{t, b}`; `analyse.mjs` reads `{realMs, board}`.** The analyser crashes on
  its own project's log. I re-emitted into the expected shape to run it.

### Hunger kills. A193 is wrong, and I am withdrawing it.

The 16:11 entry read `hungerDamageBelow: 0` as "hunger **never** deals damage" and built A193 on
it — *"starvation has no teeth"*, *"Seonaid is sitting on food 1 in no danger whatever"*. That is
a misreading of a threshold as a switch. `src/player/body.js:237`:

```js
if (this.hunger <= SURVIVAL.hungerDamageBelow) {
  this.damage(SURVIVAL.hungerDamagePerSec * dt, { kind: 'hunger' });
```

It is `<=`, and the config comment says so plainly — `hungerDamageBelow: 0, // and then it kills
you`. At *exactly* empty it fires, at `hungerDamagePerSec: 0.55`. Seonaid on food 1 was one point
from the cliff, not safe.

I watched it run on Eachann, live, at 8-second reads:

```
at=4188  food 1   hp 100
at=4199  food 0   hp  99     <- damage starts on the tick food reaches 0
at=4211  food 0   hp  91
   ...            (~0.7 hp per board-second)
at=4334  food 0   hp   3
at=4341  food 85  hp 100     <- dead, and back
```

Observed decay is ~0.7 hp/board-second against a configured 0.55/s, so hunger accounts for most of
it and cold may be adding the rest. Four of eight seats reached food 0 in the sampled window
(Fingal h20.9, Tormod h21.2, Iseabail h3.3, Eachann h23.7) and every one of them died.

### A192 is confirmed — it is no longer an inference

The 16:11 entry bet that Ailsa's food jumping 17→82 across an unobserved gap was a death and a
respawn refill, and flagged that the card cannot show it. That bet was right, and the mechanism is
now on camera in six separate instances: **hp falls to 0, and about 3.4 s later (`respawnDelay`)
the seat reads hp 100 and food 85** — `hungerStart` exactly. Ailsa did it again between two of my
reads today, 13/0 at 16:31 and 100/76 at 16:52.

The card still has no death field, so all of this is invisible to a watcher. A192's fix stands and
should move up the list.

### The bug: **a hunger death costs nothing at all**

Eachann died at h23.7 carrying **277 branches and 48 arrows**, and stood up still carrying all
277 and all 48. Meanwhile Coinneach went from `wood x105, arrow x16` to a bare bow across *his*
death. Same world, same tick rate, opposite outcomes — so I went to the code.

`onPlayerDied` — the function that drops your pack and pushes the `death` event — is reachable
from **exactly two call sites**:

- `src/sim/world.js:380` — a player's arrow lands and the target is dead
- `src/sim/world.js:1033` — a creature bites and the victim is dead

**Hunger is not one of them.** `body.js:239` calls `damage(…, {kind:'hunger'})`, which sets `dead`
on vitals, and `src/player/vitals.js:169` simply revives after `respawnDelay`. Nothing in that path
touches `onPlayerDied`. So starving to death:

- drops **nothing** — you keep the whole pack
- pushes **no `death` event** — the chat column and the report never mention it
- refills you to **food 85, hp 100**

There is a small proof of intent sitting right there. `world.js:1127` builds the death line as
``by: killer?.species?.name ?? killer?.name ?? 'the cold'``. *"The cold"* is the fallback written
for a death with no killer — an environmental death — and **no environmental death can ever reach
that line.** The fallback is for a case the code makes unreachable.

So A193's *conclusion* survives its broken premise, and gets worse. Not "hunger never hurts" —
hunger hurts, and then hands you a free full stomach and lets you keep everything you were
carrying. **Dying of hunger is strictly better than eating.** It is the cheapest meal in the game,
it is free, and it is the only food source that never runs out.

Right now, at `at=4429`: **Morag is on hp 48 / food 0 with 224 branches in her pack.** Seonaid is
on 5, Coinneach on 13. A general starvation is running through a camp where nobody is short of
anything except food, and the seats keep gathering wood.

### Trade settled six times — and the settling verb is confirmed

The 16:11 entry found *"exactly one settled trade in the whole run"* and diagnosed the cause:
both sides post `offer`, nobody writes `accept`, and only Ailsa's literal `take Morag offer` ever
settled. **That diagnosis is now confirmed by six more settlements**, and the entry's headline
number is superseded for the later stretch. Live board:

```
h10.13 / h10.18  Tormod   "I got arrow from Morag for hide"      <- intention h9.95  take Morag offer
h10.42 / h10.47  Morag    "I got hide from Eachann for arrow"    <- intention h10.24 take Eachann offer
h11.15 / h11.20  Ailsa    "I got hide from Fingal for arrow"     <- intention h11.14 take Fingal offer
```

Three pairs, five models (opus-5, grok-4.20, grok-4.5, sonnet-5, haiku-4.5), and **every single
settlement is preceded by an intention of the literal form `take <name> offer`.** Not one mutual
`offer`/`offer` pair has ever settled. The verb is the whole story.

The price is the other half: **one hide for one arrow, six times, across five different models.**
That is the first stable exchange rate this world has produced.

### Ailsa waited at the fire for a promise the world cannot hold

Her three spoken lines, verbatim, in order:

> *"wood's brought, waiting on my share"* · *"here with my wood, waiting on meat"* ·
> *"still waiting on that meat, brought my wood"*

Her plan: `["bring branches to Morag's fire", "wait for meat share", "keep watch, stay warm"]`.
She delivered the wood, stood at the fire, went to hp 13 / food 0, and died. Morag's `note` —
still the only `note` on the board — reads *"Fingal owes me a cut if he uses my fire. Coinneach
owes branches."* Both minds are keeping a ledger of obligations **in prose**, because there is
nowhere else to put one. Ailsa died of a debt the world has no way to represent or settle.

### The small columns

- **`refusedVerbs`: `{"follow":1}` on Tormod, and nothing else — fourth checkpoint unchanged.**
  Given the six silent `return`s in `resolveAccept` noted at 16:11, this remains a column that
  measures instrumentation, not refusals.
- **`plan`: 7 of 7 model seats populated, 0 of 1 scripted.** Unchanged, still a clean control.
- **`note`: 1 seat in 8, still Morag.** Four runs, one user.
- **Venison works — question answered, close it.** `gather venison` fired for real (Eachann picked
  up 2 at h12.38 and 3 at h18.32), cooking works, eating works, and one cooked cut was traded
  (Morag→Ailsa, h17.46). The carcass path is no longer the bottleneck.
- **Nobody is SPENT** — no red tag anywhere, all seats under 250. But **Eachann is at 221/250**
  and burning ~3 calls a minute. He will go scripted within the hour, and he is the seat whose
  hoarding is the run's best character evidence. Anyone reading this board after ~17:30 must check
  `mind.spent` on his card before crediting grok-4.20 with anything.

## 2026-08-09 17:10 PDT — THE HARNESS WIPED THE WORLD THREE TIMES IN NINE MINUTES, AND THE COWARD PAID THE `avoid` BUG ELEVEN TIMES IN FRONT OF THE HUMAN

**First, the brief I was working from is out of date.** The scheduled task describes a two-mind
duo (Eachann on grok, Coinneach on kimi) and points at `duo2.jsonl`. That file has not been
written since 11:28. What is actually live is the **eight-seat melee** — `roster-melee.json`,
seven models plus Iseabail scripted, `ORDERS=obeys`, `MAX_CALLS=250`. New samples in
`eval29.jsonl` (25 samples, 17:01:36–17:07:45).

**Second, and it is the whole story of this slot: I could not measure anything, because nothing
survived long enough to be measured.** Three separate wipes in nine minutes.

### Wipe 1 — 16:58:33. A hot reload killed the run this file spent all afternoon writing up

`src/main.js` was saved at **16:58:33**. `m-web.log` records `[vite] page reload src/main.js`
at **16:58:33**. The world went from **h23.7 / at=4429** — Eachann's 277 branches, the six
settled trades, Ailsa's death at the fire, everything in the last four entries — back to **h8**.

The 15:10 entry already recorded this exact mechanism once. **This is the second time**, and the
edit that cost the run was a good one (an amber disconnect bar, still uncommitted — see
`git diff src/main.js`). There is no warning and no save. The most valuable run this project has
produced was destroyed by someone doing correct work in a different file.

### Wipes 2 and 3 — 17:01:56 and 17:05:25. The board process bounces and takes the record with it

| clock | at | minds | what happened to the seats |
|---|---|---|---|
| 17:01:36 | 77 | `model` | Morag holds her note, Fingal a 3-line plan |
| **17:01:56** | **3** | **`scripted`** | all 8 cards → `provider: "scripted"`, `model: null`, goal reset |
| 17:02:36 | 7 | `model` | back on the models, `spend.calls` 14 → 0 |
| 17:04:56–17:05:16 | — | — | **three consecutive fetch failures** |
| **17:05:25** | **3** | `model` | every seat back to `bow x1, arrow x12`; Morag's 46 branches gone |

**The game clock never went backwards** — `hours` climbs 8.9 → 14.6 straight through all of it.
So this is not the world restarting; it is the board/minds process dying and rebuilding every
seat at the starting kit while the clock runs on. Two consequences:

- For ~40 seconds at 17:01, **every seat in the melee was the scripted brain.** The board was
  honest about it (`minds: "scripted"`, `model: null`), but `mind.spent` stayed `false` and no
  red SPENT tag appeared — so **the tag this file has been told to watch is not the only way a
  seat stops being its model, and it is not the one that fired today.** Anyone reading a card in
  isolation would have credited grok-4.5 with a scripted walk.
- Every accumulating metric — wood hoarded, arrows spent, kills, trades settled, `note`, `said` —
  is zeroed every few minutes. **Morag's note was wiped mid-run and rewritten from scratch.**

### The one real behavioural sequence, and it was erased 40 seconds after it finished

Between the two wipes, Eachann (`grok-4.20-non-reasoning`) ran the best character evidence of the
slot. One intention — `h10.15 "hunt deer" / "need food and hide" / said "that one is mine"` —
held unchanged from **h10.15 to h11.8**, about 110 real seconds, across ~5 decisions:

```
h10.9  loosed 3   astray 3   arrow x9
h11.1  loosed 6   astray 6   arrow x6
h11.4  loosed 9   astray 9   arrow x3
h11.5  loosed 11  astray 10  arrow x1   <- "I brought down a deer"
h11.8  loosed 12  astray 11  (empty)    <- "that one west is mine now"
```

**Twelve arrows, eleven astray, one deer, quiver empty.** The hoarder shot himself defenceless
and then set off to claim a carcass with nothing to shoot with. Wipe 3 deleted all of it; he was
back to 12 arrows at 17:05:25 and did the same thing again (8 loosed, 7 astray by 17:07).

**Why he kept firing: a mind is never told an arrow missed.** `agent.js:2481` writes exactly one
memory per release — `I loosed at N m` — and nothing anywhere writes "it went wide". `astray` is
computed in `server/board.js:251` **for the human reading the board** and never reaches the model.
This is *not* a repeat of the empty-quiver bug: that one was fixed and works (`agent.js:1033`
*"no arrows — you cannot shoot"*, `agent.js:2186`). It is the same class one rung up — the
2026-08-08 fix told minds when a shot was **refused**, and says nothing about a shot that was
allowed and **missed**.

### `avoid` — the 14:35 diagnosis confirmed live, with the best possible witness

The 14:35 entry called this and was right; nothing here is new about the cause. What is new is
watching it cost a model in front of the human player.

Jack (Ben) asked the seats to help hunt a troll. Ailsa (`claude-sonnet-5`, written timid) answered
*"Not me, Jack — too risky, I'll pass"*, set `goal: "keep away from troll hunt"`,
`why: "a troll is too much danger for me"` — and then reached for `avoid` **eleven times in about
forty seconds** and was refused every time:

```
17:06:16  avoid: 3      17:06:36  avoid: 9
17:06:25  avoid: 6      17:06:45  avoid: 11
```

`agent.js:2793` refuses with *"there is no «troll» near you to keep away from"*, because `find()`
reads contacts culled at 140 m. **The verb fails precisely when the danger is far away — which is
the state avoidance is for.** You may only avoid what is already on top of you.

**But she recovered, and that is worth recording as a result.** After the eleventh refusal she
abandoned the verb and re-expressed the identical intent as a destination:
`goal: "make for Rowan Moor"`, `why: "stay clear of the troll hunt, find food safely"`. A model
routed around a broken verb using the feedback the refusal gave it. That is the 2026-08-08
feedback fix doing exactly its job, on the one verb that is still broken.

Also: this is the **first melee run where `refusedVerbs` is non-empty.** The 14:35 and 15:10
entries recorded `{}` on every card in melee2 and melee3 and read it as a true zero. It was a true
zero *for those runs*; the column is alive.

### The small columns, this run

- **Speech is not the problem any more, and the task brief's premise is dead.** The brief says
  *"across two days and six models this world produced ONE sentence."* In six minutes this run
  produced **25 distinct lines from 5 of 7 model seats.** Morag opens with
  *"You all hunt the moor; I'll fetch branches — fire and arrow shafts by dark."*; Fingal, Eachann
  and Tormod all claim the same deer out loud (*"that one is mine"* from three different seats).
- **Morag (opus-5) rebuilt the same wood-monopoly strategy from scratch after the wipe** —
  *"Wood at the Sheiling — bring me meat tonight and you'll get a fire."* Same plan she ran in the
  destroyed run, arrived at independently on a fresh world. That is a repeatability datum for
  opus-5, not an accident.
- **`note`: Morag, alone, for the fifth run running** — *"Jack owes me 30 arrows and venison for
  the troll hunt."* Still keeping a ledger of obligations in prose, now including the human's.
- **`plan`: 3 of 7 model seats** (Morag, Fingal, Tormod) inside 4 decisions. Iseabail 0 — clean control.
- **Fires and venison both work — close these questions.** Tormod laid a fire at h11.78 and cooked
  venison at it in the same minute, having gathered 16 branches. **10 branches per fire is
  affordable, not punishing.** He also picked up 4 venison and 2 hides off a carcass.
- **Trade: nothing settled in this fragment.** Too short to say more; the wipes make it unmeasurable.
- **Both kimi seats are effectively absent.** Coinneach and Seonaid: **1 call each in six minutes**,
  no speech, no plan, no deed. At a 75 s cadence on a world running ~42 game-minutes per real
  minute, they get one decision per two game hours. They are not being outperformed — they are
  barely playing.
- **Nobody is SPENT.** Highest seat is 4 of 250.
- **The scripted control has not emptied its quiver** — Iseabail 1 loosed / 0 astray / 11 arrows,
  while Fingal is 11 loosed / 6 astray / 1 arrow and Eachann 8 / 7. One arrow is not a shooting
  statistic and I am not claiming one; noted only because the arrow economy is where the control
  has beaten paid models before, and it is the thing to measure once a run survives long enough.

### Note on this run's settings

`ORDERS=obeys`. The recogniser turns a small set of exact phrases (`follow me`, `guard me`,
`kill the troll`) straight into goals without asking the model. Ailsa's and Tormod's refusals of
Jack came back as speech and reasoning, so those fell through to the minds — but **any following
or guarding seen in this run proves nothing about the model that did it.**

## 2026-08-09 17:20 PDT — ADDENDUM, AND THREE CORRECTIONS TO THE ENTRY ABOVE: THE RUN STABILISED, `give` WORKS, AND THE BOARD DOES NOT TELL YOU WHEN A SEAT DIES

The sampler ran on to 17:17:45 (97 samples in `eval29.jsonl`). Everything below post-dates the
entry above and contradicts parts of it.

### Correction 1 — it was five wipes, not three, and then it stopped

Two more resets after I wrote: **17:08:36** (`at` 138 → 5) and **17:10:25** (three failed fetches,
then `at` → 4). So **five wipes between 16:58 and 17:10.**

**Then it held.** From 17:10:25 to 17:17:45 — **seven minutes, `at` climbing 4 → 335, h17.1 → h23.8,
45 unbroken samples** — no reset at all. Whatever was bouncing the board process stopped bouncing.
A202 stands (the run still needs to outlive the harness), but the picture is "a bad ten minutes
followed by a healthy run", not "a harness that cannot hold a run at all". I called that too early.

### Correction 2 — the scripted control is the WORST shot on the board, not the most disciplined

The entry above noted Iseabail on 1 loosed / 0 astray and said one arrow is not a shooting
statistic. It was not, and the bigger sample reverses the sign:

| seat | loosed | astray | kills |
|---|---|---|---|
| **Iseabail (SCRIPTED)** | **12** | **12** | **0** |
| Tormod (grok-4.5) | 8 | 7 | 1 |
| Eachann (grok-4.20) | 0 | 0 | 0 |

**The control emptied its entire quiver for a 100% miss rate.** Delete the implication that the
control has better shot discipline; on this run it has none. It also ends the run carrying
`wood x9, stone x2` and no arrows.

### Correction 3 — the kimi seats are not silent, they are just slow

The entry says both kimi seats had "no speech, no plan, no deed". With 4 calls each by h23.8 they
have all three: Coinneach *"No wood, no troll. I'm coming to that fire."* and a plan
(`["get wood or meat"]`); Seonaid *"four goblins right here to west"* — **the only threat warning
anybody gave all run.** The cadence complaint in A205 stands (4 calls where Eachann had 16), but
"barely playing" was too strong: they play, at a quarter of the rate.

### `give` WORKS, AND OPUS-5 EXTENDED CREDIT TO THE HUMAN UNPROMPTED

The first thing the entry above could not measure. Between **h21.43 and h21.83** Morag repeatedly
`give`s wood to Jack — the deed *"I gave wood to Jack"* recurring across samples, her wood falling
**32 → 23** — while saying:

> *"Jack, ten branches for your fire — I stand with you tonight, meat when there's meat."*
> *"Ten branches, Jack — burn them. There's a dead deer south-east, send two men before the crows."*
> *"Nine branches at your fire, Jack — I'll take venison when Eachann's back."*

That is an unforced transfer to the human on **explicit deferred terms** — goods now, meat later —
which is exactly the standing-debt object A198 says the world cannot represent. She is running
credit through the one verb that settles instantly, and narrating the other half.

Speech overall went from 25 lines to **44 distinct lines across all 7 model seats**. The trade
question from the brief is answered for `give`: it is reached for, it resolves, and a model uses it
strategically.

### THE FINDING: A SEAT DIED AND THE BOARD SAYS NOTHING

Morag's last two samples, twelve real seconds apart:

```
17:17:37  h23.7  food 34  hp 100  bow x1, arrow x12, wood x23   deeds 5
17:17:45  h23.8  food 85  hp 100  bow x1                        deeds 5
```

In one step: **23 branches and 12 arrows gone, food 34 → 85, hp 100 → 100, and `deeds` unchanged
at 5.** Everything but the bow, which is `KEEP_ON_DEATH`. Food 85 is the respawn refill the 16:45
entry identified. She was not starving. There are goblins on her — Seonaid had just called *"four
goblins right here to west"* and Tormod killed one at h23.44.

**She was killed, and there is no death on her card.** No deed, no event, no marker. Her plan's
third line reads `"keep 12 arrows"`.

This matters more than the death does. **A reader looking at the final board sees opus-5 finishing
with an empty pack and a full stomach immediately after giving her wood away, and the obvious
reading — "she gave everything to Jack and got nothing back" — is wrong.** I nearly wrote it. The
only reason I did not is that the sampler happened to catch the frame before.

The 16:45 entry found hunger deaths push no `death` event. This is a *combat* death that also
reached the board as nothing at all, so whatever the gap is, it is wider than the hunger path.
Until a death shows up on a card, **every inventory and food number on this board is unreliable in
a way that silently favours the wrong conclusion.** **A207.**

### Final state, h23.8, and nobody is SPENT

| seat | model | calls | food | k | loosed/astray | carrying |
|---|---|---|---|---|---|---|
| Morag | opus-5 | 9 | 85 | 0 | 0/0 | bow *(just died)* |
| Eachann | grok-4.20 | 16 | 31 | 0 | 0/0 | bow, 12 arrow, **66 wood**, 2 stone |
| Tormod | grok-4.5 | 11 | 36 | 1 | 8/7 | bow, 4 arrow |
| Coinneach | kimi | 4 | 35 | 0 | 0/0 | bow, 12 arrow |
| Seonaid | kimi | 4 | 35 | 0 | 0/0 | bow, 12 arrow |
| Ailsa | sonnet-5 | 11 | 34 | 0 | 0/0 | bow, 12 arrow |
| Fingal | haiku-4.5 | 13 | 34 | 0 | 0/0 | bow, 12 arrow, 3 wood |
| Iseabail | SCRIPTED | 0 | 32 | 0 | 12/12 | bow, 9 wood, 2 stone |

Highest seat is 16 of 250; `spend.calls` 68 of 4000. **The hoarder is winning on his own terms** —
Eachann ends with 66 branches, the largest holding on the board, having stopped hunting entirely
after his quiver emptied. `refusedVerbs` is `{}` on every card in the stable window; Ailsa's
`avoid: 11` was lost in the 17:08 wipe. **`note` is empty on all eight seats** — the first window
in five runs where even Morag wrote nothing.

## 2026-08-09 17:30 PDT — MY OWN CAVEAT WAS BACKWARDS, AND `why: null` IS THE ONLY THING ON THE BOARD THAT SEPARATES AN ORDER FROM A DECISION

`23d2a20` landed at **17:11:37**, in the middle of the window I was sampling, and its finding
rewrites both entries above:

> *"loadRoster normalised a line that said NOTHING about orders into one saying 'decides' … So the
> environment variable could never win, and the startup banner printed 'orders: obeys' over the top
> of eight agents every one of which was set to decides."*

**`ORDERS=obeys` was silently dead for every run that used a roster.** `melee2.cmd` sets it; the
banner said it; it was never in force.

### Correction — the 17:10 entry's closing caveat is exactly wrong for the early window

I wrote: *"any following or guarding seen in this run proves nothing about the model that did it."*
For everything before the fix reached disk, **the opposite is true.** The run was on `decides` no
matter what the banner claimed, so Ailsa's refusal of the troll hunt, the eleven `avoid` attempts,
Tormod's *"meat first, then maybe your troll"* and Eachann's *"not my troll"* were **all model
choices with no recogniser anywhere near them.** Those observations get stronger, not weaker.

`server/roster.js` was saved at **17:06:16** and `providercheck.js` at 17:07:07 — so wipes 4 and 5
(17:08:36, 17:10:25) were almost certainly the developer restarting to test this fix. **That
downgrades part of A202**: two of the five wipes were someone iterating on purpose, not an
unexplained fault. The 16:58 hot reload and the 17:01/17:05 bounces still stand as real.

### And then obeys went live, and you can see the exact tick it did

At **17:13:57**, five seats flip in the same sample to the identical goal:

```
17:13:57  Morag / Coinneach / Seonaid / Ailsa / Fingal   goal "stay with Jack"   why: null
17:15:57  Eachann / Tormod / Iseabail                    goal "stay with Jack"   why: null
```

**`why` is `null` on every one of them.** Every model-authored goal in 97 samples carries a `why`;
these carry none, because no model was asked. **Iseabail got one too** — the scripted control, which
has no model at all — which settles that this is the recogniser and not eight minds agreeing.

So the caveat is right for the late window and wrong for the early one, and the boundary is visible
to the sample: **before ~17:12 everything is the models; from 17:13:57 the mass "stay with Jack" is
the harness.**

### The instrument point, which is the reusable part

`(ordered)` — the marker `23d2a20`'s own verification quotes — **appears nowhere in `board.json`.**
Zero matches across 97 samples. The only way I could separate an ordered goal from a chosen one was
noticing that `why` was null, which is an accident of how the recogniser writes goals, not
instrumentation. Two seats make the danger concrete in the same minute:

```
17:14:17  Fingal  "make for Jack's fire east of Broad Loch"
                  why "Jack said arrows and a stand against the troll. I gave my word."   <- CHOSE
17:13:57  Fingal  "stay with Jack"                          why null                      <- ORDERED
```

Same seat, same human, twenty seconds apart, and on the board they look like the same kind of fact.
One is haiku-4.5 keeping its word; the other is a string match. **A210.**

## 2026-08-09 17:40 PDT — `refusedVerbs` IS NOT A TRUE ZERO: 43 `hunt` REFUSALS IN FIFTY SECONDS, ACROSS ALL EIGHT SEATS AT ONCE — AND EVERY COUNTER ON THE CARD RESETS WHILE `hours` DOES NOT

The roster the scheduled task describes (Eachann + Coinneach, two minds) is **not what is running.**
The live board is the six-model melee: eight seats, seven with a model, `Iseabail` scripted. Board
answered throughout. Spend at close: **235 of 4000 calls, `exhausted: false`, no `SPENT` tag on any
seat, no fallbacks, `fellBack: false` everywhere.** One failure all run — Seonaid, `no json in
reply`. Everything below is the models.

### Two corrections to my own first readings, before anything else

I got two things wrong in this session and caught both before writing them down. Recording them
because the failure mode is the one this file keeps repeating.

**1. "Morag gained +39 food from nowhere."** I had the same shape as the 16:08 entry's Ailsa finding
and nearly filed it as corroboration. Traced per-sample, Morag's food decays −1 a tick and then
jumps to **exactly 52** four times. 52 is the starting value. Those are respawns, not free food.

**2. "Six of seven model seats held a hunt goal and never loosed an arrow."** Also wrong, and worse,
because it was the sort of number that reads as a damning verdict on the models. **The counters
reset on every restart.** Reading the last sample, Fingal shows `loosed: 0`; at 17:08:05 Fingal
showed `loosed: 12`. That whole life was wiped thirty seconds later.

### The instrument finding, which is why both of those went wrong

The world restarted **five times in thirty-five minutes** — six world-lives, the last one stable for
27 minutes and still going. And across every one of them:

```
17:01:36   at=77    food=46   hours 8.9
17:01:56   at=3     food=52   hours 9.2     <- restart
17:05:25   at=3     food=52   hours 12.5    <- restart
17:08:36   at=5     food=52   hours 15.4    <- restart
17:10:25   at=4     food=52   hours 17.1    <- restart
```

**`at`, `food`, `loosed`, `astray`, `kills`, `wounds` and `refusedVerbs` all reset. `hours` does
not — it climbs straight through, monotonically, 8.9 → 17.2.** So a card can read *"hours 23.8,
loosed 0"* and both numbers are true and mean nothing standing together: it is not a body that hunted
for a day and never shot, it is a body that was born four minutes ago wearing an inherited clock.

That has a consequence for this file. **Every "N game hours" figure here that spans a restart is
measuring wall clock, not world life** — including the "23-hour run" and the "fifteen more game
hours" of earlier entries. `at` is the only honest run-length field on the board, and it is the one
nothing has been quoting.

### The headline: `refusedVerbs` is alive, and the 15:10 entry's "true zero" was a sampling artifact

Taking the **peak per world-life and summing** — the only correct way to read a resetting counter:

```
Morag      claude-opus-5        hunt 4
Eachann    grok-4.20            hunt 5
Tormod     grok-4.5             hunt 9
Coinneach  kimi-k2.6            hunt 2
Seonaid    kimi-k2.6            hunt 9
Ailsa      claude-sonnet-5      hunt 9,  avoid 11
Fingal     haiku-4.5            hunt 1
Iseabail   (no model)           hunt 4
                                ---------------
                                hunt 43, avoid 11
```

`avoid 11` on Ailsa is **exactly** the eleven the 17:10 entry counted — independent confirmation
that the per-life segmentation is reading the same events, and that A204 is still live.

`hunt 43` is new, and the way it arrived is the whole point:

```
17:35:32  at=1141   total 0
17:35:46  at=1152   total 7    every seat but Ailsa, one each
17:35:52  at=1157   total 20
17:36:06  at=1167   total 36
17:36:26  at=1182   total 43
17:36:32 → 17:38:26  at=1187…1274   total 43, flat, unchanged for two minutes
```

**Zero to 43 in fifty seconds across all eight seats simultaneously, then a dead stop.** Eight minds
on different cadences — opus-5 against kimi at 75 s — cannot independently decide to hunt within the
same twenty-second sample and independently stop within the next. This is a world event, not a
decision. And **Iseabail, which has no model at all, took four of them**, which rules out a
model-comprehension failure the same way it ruled one out for the ORDERS finding.

### What the refusal is, and what it is not

`src/net/agent.js:2694` — `hunt` refuses when nothing matching the quarry is in sight, says *"there
is no deer in sight — you are searching, not hunting"*, and **returns `roam()`**.

It is not a name-parser bug: `namesTheSame('a deer', 'deer')` strips the article and matches on the
first branch. The refusals are honest.

Two candidate causes, and **I did not separate them** — saying so rather than picking the tidier one:

- **The bodies clustered.** At exactly that moment most seats carried the harness's ordered goal
  `stay with Jack` (`why: null`, per the 17:30 entry). Eight bodies converging on one man all lose
  sight of the same herd at the same instant, which fits the synchronisation exactly.
- **The herd was hunted out.** `src/creatures/manager.js:370` — *"Died there → `clearedSites`, gone
  for good. You hunted it out."* Killed herds never come back; only herds left alive re-roll. There
  were **6 kills** this run.

They want opposite fixes, and one sample of creature positions at 17:35:46 would settle it. Nothing
on the board carries what a body can see, so it cannot be settled from `board.json` at all.

### Archery, over all six lives — and the models outshoot the script four to one

```
                                loosed  astray  kills  wounds
Morag      claude-opus-5             0       0      0       0
Eachann    grok-4.20               21      18      2       1
Tormod     grok-4.5                16      14      2       0
Coinneach  kimi-k2.6                5       5      0       0
Seonaid    kimi-k2.6                0       0      0       0
Ailsa      claude-sonnet-5          0       0      0       0
Fingal     haiku-4.5               16      10      2       2
Iseabail   (no model)              26      25      0       1
TOTAL                              84      72      6       4     11.9% hit
```

**The scripted control loosed more arrows than any model seat and hit least: 26 shots, one wound,
3.8%.** The seven model seats between them: 58 arrows, 9 hits, **15.5%** — four times the control's
rate. A209 asked for the control to get its own arrow budget; this is the number that justifies it,
and it is also the first evidence in this file that the aiming path actually rewards a model's
judgement rather than being noise.

Three seats — Morag (opus-5), Seonaid (kimi), Ailsa (sonnet-5) — never loosed once across all six
lives. Morag held a written plan of *"kill deer, bring it to Scaur fire"* and four refused hunts.

### The two fields a mind writes for itself

Across 108 samples and eight seats: **133 distinct sentences**, of which **7 name a deal** —
*"Eachann, Ailsa, a branch each buys venison"*, *"Jack, let me at your fire. I owe you arrows."*
Speech is thoroughly alive; the "one sentence in two days" era is over and stays over.

`plan` is written by **all seven** model seats (Morag 38 distinct lines, Ailsa 22, Fingal 9).
**`note` is written by one seat, Morag, three times, in the entire run. Six of seven models never
touched it.** It is the only field on the card that is still effectively dead.

### 17:45 addendum — eight more minutes: hunting stopped dead, and the funnel breaks at the APPROACH, not at the sight

The sampler ran on to 17:44:32 (`at` 1551). From the end of the burst at `at` 1182 through `at` 1551
— **370 ticks, eight minutes, ~90 model decisions** as `calls` climbed 235 → 324:

```
refusedVerbs  43 -> 43   (flat)
loosed        40 -> 40   (flat)
kills          2 ->  2   (flat)
```

Not one arrow, not one refusal. And that combination is more interesting than either number alone,
because **26 of 384 player-samples in that window still carried a hunt goal.** A hunt goal that
draws no refusal means the quarry *was* in sight — `hunt` only refuses when it cannot find one. So
for eight minutes bodies were choosing to hunt, seeing deer, and never loosing.

**That moves the diagnosis.** The burst said the funnel breaks at the sight step; this window says
that when sight is not the problem, it breaks at the **approach** — the body walks and never closes,
exactly the failure `huntcheck.js` was built to measure and which A212's "make the refusal change
the goal" would not touch. Two different faults wearing the same symptom, which is why the fifty
seconds of refusals should not be read as the whole story.

**And the caveat that governs the whole late run:** `why: null` — the 17:30 entry's marker for a
harness-ordered goal — is on **201 of those 384 player-samples, 52%.** More than half the late run
is the ORDERS recogniser, not the models. It is a floor and a ceiling at once, because three seats
carry model-written whys that are *about* an order — Tormod *"stick close as told"*, Fingal *"told
to stay close, strange ground here"* — so the `why: null` count misses orders the model reasoned
about, and counts as ordered some goals a model might have picked anyway. **A210's request for a
real `ordered` flag is the only thing that fixes this; the heuristic cannot be sharpened further.**

One live counter-example, and it is the good kind: Morag and Eachann finished the window mid-trade —
`take Eachann offer` / *"food now, wood is cheap to me"* against `take Morag offer` / *"take her
branch offer"*. Both model-authored, both with reasons, pointed at each other.

## 2026-08-09 18:05 PDT — THE MARKET TALKED FOR HALF AN HOUR AND CLEARED NOTHING: 38 TRADE ACTS, 0 SETTLEMENTS — AND MY OWN 17:45 CLOSE WAS WRONG

**First, the roster.** The scheduled task still describes a two-mind duo run (`roster-duo.json`,
Eachann + Coinneach) and points at `duo2.jsonl`. That is stale — `duo2.jsonl` last grew at 11:28.
What is actually live is the **eight-seat melee** (`roster-melee.json`), sampled to `eval30.jsonl`.
This entry is that run, `at` **1000 → 2329**, 124 samples over **29 real minutes**, `spend.calls`
**206 → 488**. Same run the 17:30/17:40/17:45 entries were watching; it did not die, and the day
clock wrapped through midnight at `at≈1540`, which is why raw `h` values are not a timeline.

### The correction I owe: those two were not "mid-trade". They never finished.

The 17:45 addendum closed on a hopeful note — *"Morag and Eachann finished the window mid-trade …
Both model-authored, both with reasons, pointed at each other."* **They never settled.** Ordered by
the tick each intention first appeared:

```
at 1000  Eachann   take Morag offer
at 1005  Eachann   offer cooked venison to Morag for branch
at 1106  Eachann   take Morag offer
at 1141  Eachann   offer cooked venison to Morag for branch
at 1167  Eachann   take Morag offer
at 1182  Eachann   take Morag offer
at 1202  Eachann   take Morag offer
at 1243  Eachann   take Morag offer
at 1263  Eachann   take Morag offer
at 1304  Eachann   offer cooked venison to Morag for branch
at 1349  Eachann   offer cooked venison to Morag for branch
at 1384  Eachann   take Morag offer
at 1410  Morag     take Eachann offer          <- and Eachann re-offers on the same tick
at 1425  Eachann   take Morag offer
at 1440  Morag     take Eachann offer
```

Fifteen trade acts between those two across 440 ticks, then eight more from Morag alone
(`at` 1689 / 1795 / 1901). **Zero `trade` deeds in the entire log.** Across all eight seats:
**16 `offer` + 22 `accept` = 38 trade acts, 0 settlements**, over 282 model calls.

### That breaks the rule this file confirmed at 16:11

The 16:11 entry, reinforced at 16:45, established that *"every single settlement is preceded by an
intention of the literal form `take <name> offer`"* — the verb was the whole story. **This window
has 22 `take <name> offer` intentions and not one settlement.** So `accept` is necessary and is
**not** sufficient, and the earlier finding should be read as "accept is the verb that *can* settle",
not "accept settles".

Two things in the data point at why, and I can prove one of them:

1. **Eachann advertised meat he had eaten.** He held exactly **1 cooked venison** at `at 1000` and
   **0 from `at 1643` onward** — his own deed says *"h2.16 I ate a cooked meal"*. He went on posting
   `offer cooked venison to Morag for branch` at `at` 1304, 1349, 1410 and saying *"one branch now"*.
   `resolveOffer` clamps the count to holdings but floors it at one — `Math.max(1, Math.min(…))` —
   so **holding zero still advertises one**, and `resolveAccept` then bails on
   `giver.inventory.countOf(deal.item) < gives`, silently.
2. **Eachann accepted an offer that does not appear to exist.** In the 23 of Morag's 38 captured
   decisions in this window, Morag posts no offer to Eachann at all — her offers go to Tormod
   (`at` 2115, 2176) and Ailsa (`at` 2146), all *after* his eight accepts. `giver.offer` is a
   **single slot aimed at one person**; `resolveAccept` returns silently on `deal.to !== taker.id`.
   *Caveat, stated because this file has been burned before:* the `intentions` array holds only the
   last five, and I captured 23 of Morag's 38 decisions (~60%), so I cannot rule out an unseen
   offer. What is not in doubt is the outcome — nothing changed hands.

Either way the mechanism is the same and it is the harness, not the models: **`accept` is a
one-shot pulse** — `agent.js` fires `i.accept` for exactly one tick on arrival and then drops the
target — and **`resolveAccept` has six silent `return`s**. A failed trade is indistinguishable from
a successful one from inside a mind: no event, no outcome line, no refusal. Which is exactly why
`refusedVerbs` shows `{"hunt": …}` on all eight cards and **zero `offer`/`accept` refusals** while
`accept` was the second-most-reached verb in the run.

Meanwhile the verb that *does* work kept working: **8 gifts** (Ailsa → Seonaid ×4 arrows,
Morag → Ailsa ×4 wood). `give` uses the same walk-then-act path, so closing is not the problem.
Note also that a gift moves **one item per decision** — Morag spent four consecutive calls to hand
over four branches while carrying fifty-one.

### `refusedVerbs` is a DWELL counter, not an attempt counter

Every change point of `hunt` across the run, all eight seats:

```
sample   time      Morag Each Torm Coin Seon Ails Fing Isea
  0    00:32:26      -    -    -    -    -    -    -    -
 24    00:36:26      4    5    9    2    9    9    1    4     <- then FLAT for 20 minutes
107    00:56:13      4    5    9    5   11   10    1    5
118    00:59:53     17   15   28   19   43   31    1   13
123    01:01:33     21   20   35   44   70   37    5   18
```

Seonaid went **44 → 70 in a single 20-second sample** while her seat decides once every **75 s**.
Twenty-six refusals cannot be twenty-six attempts. `this.resolve(g)` runs every tick and `refuse()`
increments every time, so the column measures **how many ticks a body stood inside an unsatisfiable
goal**, not how many times a model reached for the verb. Seonaid's 70 is one decision — *"hunt a
troll"* with no troll in sight — held for seventy ticks. Read as attempts it makes kimi look
frantic; read correctly it makes kimi look **stuck**, which is a different bug and a worse one.
Run total: **250 hunt refusals, 2 kills.**

### The small columns

- **`note` is now written by NOBODY.** Zero of seven model seats, all 124 samples. The 16:45 entry
  had Morag using it as an obligation ledger; her note this run is `""`. A214 stands and hardens.
- **`plan`: 7 of 7 model seats, 0 of 1 scripted** — 46 distinct lines from Morag, 25 from Ailsa,
  2–5 from the rest. Still the cleanest model-vs-script signal on the card, and plans persist:
  Morag's *"collect venison owed by Ailsa, Tormod"* survived across a dozen decisions.
- **Speech: 184 distinct sentences across 7 seats** (Fingal 43, Morag 41, Ailsa 38). The "one
  sentence in two days" era is dead and buried; every single trade act carried a spoken price.
- **Nobody is `SPENT`** — highest is Eachann at 116/250. Nothing on this board is the scripted brain
  except Iseabail, who is meant to be.
- **The scripted control still cannot shoot:** Iseabail **24 arrows, 24 astray, 0 kills**. The seven
  model seats: 33 loosed, 2 kills. A209's arrow budget is still the right ask.
- **Both kimi seats failed once each in ~30 calls (3%)**, and the errors are the interesting part:
  *"reply cut off at 8000 tokens — raise maxTokens for this seat"* and *"no json in reply"*. kimi
  is configured at `maxTokens: 8000` and burned all of it without emitting JSON. The three Anthropic
  seats run at `maxTokens: 300` with **0 failures in 236 calls**.
- **Wood is not scarce and fires are not the problem.** 23 fires and 58 gathers in the window, and
  the packs are fat — Morag 51 wood, Ailsa 47, Fingal 40, against a 10-branch fire. The 106-fire era
  is over; nobody is short of wood. **They are short of meat**, and the whole market was denominated
  in a good that only two kills all run ever produced.

---

## 2026-08-09, 18:35 — the eight-seat melee, game hour 20, 214 samples over 59 real minutes

Roster note first: the task file still describes this as the **duo** (`roster-duo.json`, Eachann +
Coinneach). It is not. The live board is `roster-melee.json` — **seven model seats plus one scripted
control** — and the sampler log is `eval30.jsonl`, not `duo2.jsonl`. Anyone reading this file for
the duo run wants the 08-08 entries.

`776 calls of 4000`. **Nobody is `SPENT`** — highest is Eachann at 186/250. Every behaviour below is
a model's.

### THE HEADLINE: `give` ships whatever is in the pack, not what the mind asked for

Morag (opus-5) killed a deer, butchered it, cooked it, and sold it. Every step is in her deed log:

```
sample 199  at 3484   I brought down a deer
                      I picked up 3 venison
                      I made 2 cooked venison at the fire
                      I made a cooked venison at the fire      -> Morag v3 / w52
```

Her next intention is `give cooked venison to Coinneach`, and she says it out loud:
*"Hot venison, Coinneach — send the eight branches over and we're square."*

What actually happened, on tick order (not on `h`, see the hazard below):

```
sample 206  at 3591   Morag v0/w49   Coinneach v3/w13
                      Morag: I gave wood to Coinneach   x5
                      Coinneach: I picked up 3 cooked venison
sample 207  at 3606   Morag v0/w43   Coinneach v3/w19
                      Morag: I gave wood to Coinneach   x5
```

Three things, all of them bad:

1. **The buyer did not receive the goods, he scavenged them.** Coinneach's own deed is
   `gather` — *"I picked up 3 cooked venison"* — off the ground. There is **no `give` deed naming
   venison anywhere in the run**, and **no `trade` deed at all** (`agent.js:509` emits one; it never
   fired). All 34 give deeds in 59 minutes name `wood` or `arrow`.
2. **The seller shipped the wrong commodity ten times.** The deed text is honest —
   `agent.js:516` prints `e.id`, the item that actually moved. The substitution happens one layer
   down, in **`giftFrom` (`src/sim/world.js:983`)**: if the named item doesn't resolve or isn't
   held, it falls through to *any edible*, and then to **the biggest stack in the pack**. Morag's
   biggest stack was 52 wood. She spent ten consecutive decisions paying a debt in the wrong good
   and nothing told her.
3. **Nobody paid.** Coinneach's wood went **up**, 8 → 19, across his own purchase, because Morag was
   giving him branches. Her `note` still reads *"Coinneach owes me 8 branches for one cooked
   venison."* Ailsa then gave Morag wood **eleven** times (samples 210–214) against a venison that
   no longer existed, and said *"I've already given plenty, Morag — my venison?"* Nothing tells her
   either.

Open question I will not guess at: **what put the venison on the ground.** Morag has no `drop` deed.
`resolveGive` never drops — it refunds into the giver's pack. The next place to look is
`resolveAccept` (`world.js:~909`), which is the only trade path with a partial-credit branch.

### Corrections to earlier entries in this file

- **`note` is not dead.** The 18:05 entry says *"`note` is now written by NOBODY. Zero of seven
  model seats."* That was true of that window and is **false here**: Morag wrote one and held it all
  run, as an obligation ledger — *"Coinneach owes me 8 branches for one cooked venison. Ailsa badly
  hurt to the south — feed her if she comes."* Still **1 of 7 seats**, so A214's direction stands;
  the absolute claim did not.
- **`follow` and `guard` were both used.** `analyse.mjs` prints *"WHAT NOBODY EVER DID: attack,
  follow, guard"*. It is wrong on two of three. `goals.js:159` renders `follow` as **"stay with X"**
  and `goals.js:168` renders `guard` as **"keep X from harm"** — and the intention list holds
  *"stay with Jack"*, *"stay with Tormod"*, *"keep Jack from harm"*. This is the **third and fourth**
  instance of exactly the spelling bug that file already documents for `say` and `accept`. Only
  **`attack`** ("go for X") is genuinely unused, in a run with two goblin sightings.

### `hunt` refuses where `offer` walks — and two seats never loosed an arrow

`refusedVerbs` is still `hunt` and nothing else, on all eight cards (dwell ticks, not attempts — A218
stands). The reason histogram across the run: **111 "too far"** and **~100 "ground/tree in the way"**.

```
seat        model                        hunt-dwell  loosed  kills
Coinneach   kimi-k2.6                          101       0      0
Ailsa       claude-sonnet-5                     46       0      0
Seonaid     kimi-k2.6                          109       4      0
Iseabail    SCRIPTED                            22      36      0
```

Two seats went the entire run without putting **one arrow in the air**. The brief tells a mind
*"You do NOT need to approach first: offer and give both walk you to them"* (`providers.js:311`).
`hunt` does not walk you to the quarry — it refuses, and the mind must separately choose `approach`.
The two verbs that were fixed close the distance; the one verb everybody reaches for does not.

### What worked

- **`gather venison` works, live, first confirmed time.** Morag's kill → 3 venison → 3 cooked
  venison is the full butcher chain by a real model. That fix is good.
- **Speech is at full volume.** 400+ distinct sentences across seven seats; Morag alone 80. Every
  trade act carried a spoken price. The "one sentence in two days" era is over.
- **`plan`: 7 of 7 model seats, 0 of 1 scripted** — Morag 57 distinct, Ailsa 19, 1–8 for the rest.
  Still the cleanest model-vs-script tell on the card.
- **Nobody died. Health 100 on all eight seats** — with Eachann at food 16 and Fingal at 37. Hunger
  has no teeth at this setting.

### Analysis hazard, for whoever writes the next entry

**`deeds[].h` is hour-of-day and wraps at 24.** Sorting deeds by `h` across a multi-day run
interleaves days and produces a plausible, wrong chronology — my first pass had Coinneach picking up
the venison *before* Morag cooked it. Sort by **sample index** or the board's `at` tick instead.
Both are monotonic. `analyse.mjs` does not do this anywhere yet, but its next reader will want to.

---

## 2026-08-09 19:05 — the same world, 25 minutes on: **`accept` never settles, and `give` costs one call per branch**

Same run as the 18:35 entry (same eight seats, `at` 5046 → 5247, hunt-dwell counts continued
upward from it). Read off the live board plus `eval30.jsonl` (312 samples) — **not** `duo2.jsonl`,
which is a *different, earlier* run (11:28) and matters below. The task file's roster description
(two minds, Eachann + Coinneach) is long out of date: this is **seven model seats + one scripted**.

### Eachann is SPENT — his behaviour has not been the model's for some time

`calls 250/250`, `spent: true`. **Everything Eachann has done since he hit the cap is the scripted
brain, not grok-4.20.** He still shows 3 kills and 78 food and reads like the healthiest seat on the
board; none of that late competence is a model result. Iseabail is `SCRIPTED` by design (0 calls).
So of eight cards, **two are not minds** — read the board accordingly.

### The finding: 64 trade intentions, 0 trades

Deed histogram across 312 samples of this run:

```
gather 315 · place 79 · give 65 · craft 17 · eat 9 · killed 6 · trade 0
```

**Zero.** Against **38 `offer` and 25 `accept` intentions**, priced and negotiated out loud —
*"eight branches for a share, Morag"*, *"Two branches for a cooked meal."*, *"one gold or no deal"*.

This is not the trade path being broken in general. **`duo2.jsonl` (the 11:28 run, same roster)
contains 10 trade deeds — 5 real settlements**, both sides logged:

```
Morag 8.96  "I traded venison_cooked to Ailsa for wood"
Ailsa 8.96  "I got venison_cooked from Morag for wood"
```

So offer/accept works. In *this* run it fired 63 times and settled nothing.

**This corrects the 18:35 entry's open question.** That entry named `resolveAccept`'s partial-credit
branch (`world.js:~909`) as "the next place to look" for the venison that appeared on the ground.
It cannot be that: in this window **`resolveAccept` never completed once**, so that branch never
ran. (Caveat, honestly: `deeds` is a 5-deep ring buffer sampled every 20 s, so this is a floor —
but 65 `give` deeds survived the same sampling, and duo2 surfaced 10 trades in *fewer* samples.)

### Why it never settles: a mutual-accept deadlock, and it fails in total silence

Verbatim, Eachann and Morag standing ~2 m apart:

```
21.51  Eachann  offer cooked venison to Morag for branch   340 m north of Low Rigg   "one branch now, done"
21.56  Morag    take Eachann offer                         342 m north of Low Rigg   "Done, Eachann — a branch for the venison."
21.92  Eachann  take Morag offer                           341 m north of Low Rigg   "done, branch for venison"
22.27  Morag    take Eachann offer                         398 m north of Low Rigg   "Taken."
```

Both sides oscillate between offering and accepting. `accept` against a counterparty with no live
offer to you returns **silently** from `resolveAccept` — no refusal, no event, no deed, nothing on
the card. `refusedVerbs` reads `{"hunt": N}` on all eight seats and **nothing else**, because the
goal layer only refuses `accept` when the *person* can't be found (`agent.js:2740`); every other
failure is a quiet `return`. A mind saying "Done." and receiving silence has no way to learn.

### What it cost: Tormod is dying of it

Tormod (grok-4.5) gave Morag **14 branches one at a time, then 9 arrows one at a time** — 23
separate deeds at ~0.05 h intervals — against a venison share that never came.

```
Tormod   hp 21   food 0   carrying: 3 wood, 7 arrows
         goal: "offer branch to Morag for cooked venison"   why: "starving hurt need meat now"
```

He is the only seat under 100 health. Morag sits on 73 branches, a lit fire, and a `note` reading
*"Coinneach owes me 8 branches for one cooked venison."* — a creditor's ledger, kept faithfully,
while her supplier starves. **`give` defaults to a count of 1** (`world.js`, `Math.max(1,
Math.min(99, Math.floor(count) || 1))`) and the deed text carries no number — unlike `gather`,
which says "I picked up 35 branches". So paying a 14-branch price costs **fourteen model calls**.
That is what the seats fell back on when `accept` stopped answering.

### What the 2026-08-08 fixes actually did — the honest scorecard

- **Speech: landed, decisively.** **366 of 553 intentions carried a `say` (66%)** — Fingal 113/118,
  Morag 49/49, Ailsa 58/63. Scripted Iseabail: **0/110**. The "one sentence in two days" era is
  over, and `said`-rate is now as clean a model-vs-script tell as `plan`.
- **`plan` / `note`: used, and load-bearing.** All seven model seats hold a plan. Morag's note is a
  real obligation ledger carried across hours.
- **Carcasses: work.** 5 `gather venison`, 17 cooked crafts, 9 eats. The butcher chain is real.
- **`refusedVerbs`: the best column on the card, and it says one word.** 494 refusals, **all
  `hunt`**. 92 "too far"; ~144 "a tree/the ground in the way N m out". Refused shot distances:
  median **25 m**, max **273 m**. A218/A224 stand unchanged.
- **Fires: the 10× price did not bite.** 79 fires this run (89 in duo2) at 10 branches each.
  Eachann carries 123 wood, Morag 73. Wood is not scarce; it is just heavier to spend.
- **Trade: reached for constantly, settles never.** See above.

### Jack is the human, and the board cannot see him

**202 mentions of "Jack"** in `minds.log`, including `stay with Jack (ordered)` on four seats — he
issues orders, so he is Ben's browser-connected character, not a hallucination. He is **absent from
`board.json`**, which lists only the eight agent seats. Half the social graph in the intention log
points at a person the watcher's main instrument does not render.

*(Could not verify the "also out there" feature from this run: `minds.log` records decisions, not
prompts, so the phrase never appears there either way. Minds do target people at 400 m+, which is
consistent with it working, but that is not proof.)*

---

## 2026-08-09 19:35 PDT — THE RUN IS OVER. And the reason the market never cleared is not `accept`: **dying is a free meal**

The board stopped answering at **19:06:34** (`fetch failed`, connection refused, still refused at
19:31). I have not restarted it. The eight-seat melee ran **17:32:26 → 19:06:14 unbroken** — 318
board samples, `at` climbing 1000 → 5270 with **no world reset** (so, unlike the 17:10 entry's run,
nothing was wiped underneath this one). Three two-seat worlds flickered afterwards at 19:13, 19:15
and 19:24, each dead within a sample or two, and **all three reported `model: stub-1` — no minds at
all**. Evidence: `eval30.jsonl`, 321 good samples of 396 lines.

**Correction to this task's own premise.** The roster named in the evaluation brief — Eachann on
grok + Coinneach on kimi, two seats, no scripted control — **was not what was running today**. The
live world was the eight-seat melee, and `duo2.jsonl` (the log the brief names) is an eight-hour-old
melee snapshot from 11:28, not a duo log at all. Everything below is the melee.

### The headline: hp reaches 0, and the seat is handed back full health *and a full belly*

Six of the eight seats touched **hp = 0 with food = 0**. Not one of them died. Verbatim, Ailsa
(sonnet-5), one sample per 20 s:

```
17:58:33  hp=32   food=0   decisions=72
17:59:13  hp=10   food=0   decisions=74
17:59:53  hp=100  food=84  decisions=75    <-- same seat; decisions kept counting
```

Same for Coinneach 17:57:33, Tormod 17:58:53, Fingal and Iseabail 18:15:13, Morag 18:18:53. Starving
to nothing costs you a few minutes of walking and pays out **~84 food**, which is more than any
trade on this board has ever moved.

This reframes six weeks of entries. Every previous look — 13:05, 18:05, 19:05 — has gone hunting for
the bug in `accept` that stops the market. `accept` **is** broken (below), but it is the second
reason nothing clears. The first is that **no mind is ever obliged to buy anything.** Hunger has no
teeth, so a market has no customers. Fix `accept` on its own and I predict the trade count barely
moves.

### What the numbers say

- **0 trades in 94 minutes.** Deduped deed census across 2,544 player-samples: `gather` 320,
  `place` 80, `give` 65, `craft` 17, `eat` 9, `killed` 6, **`trade` 0**.
- **…against 424 trade-family decisions — 16.7% of every decision made.** 216 `offer`, 142 `accept`,
  66 `give`. One in six thoughts in this world was about a deal and none of them closed.
- **`gold` never moved.** Only Tormod ever held any, a constant `2`, all run. `offer`'s
  price-defaults-to-gold change has never once been exercised by a real model.
- **`refusedVerbs` says exactly one word across all 2,544 samples: `hunt`.** 494 refusals, no other
  verb, ever. So 358 offer/accept decisions produced 0 settlements **and 0 refusals**. That is the
  silent-return bug, now visible at board level rather than inferred from source.

### The quarry parser is eating stopwords

**85 of 528 hunt-goal samples (16%) named something that cannot be hunted**, on all eight seats:

```
"hunt a is"  37    "hunt a from" 19    "hunt a it"  9
"hunt a north" 7   "hunt a southwest" 7    "hunt a to" 6
```

Against `"hunt deer"` 242 and `"hunt a deer"` 180. The noun parser is grabbing a preposition or a
compass word as the quarry. Given that `hunt` is also the *only* verb that ever refuses, a good
share of those 494 refusals are the harness refusing a target the harness itself invented.

### `plan` is the best column on the card. `note` is nearly dead

- **`plan`: 318/318 samples non-empty on all seven model seats; 318/318 EMPTY on scripted Iseabail.**
  A perfect separator — cleaner than `said`, and free. Real content, e.g. Morag:
  `["haul venison back, build fire", "cook: Seonaid, Coinneach, Ailsa, Tormod", "Coinneach owes 8 branches"]`.
- **`note`: one seat out of seven, ever.** Morag, 113 samples, and it is genuinely load-bearing —
  *"Coinneach owes me 8 branches for one cooked venison. Ailsa badly hurt to the south — feed her if
  she comes."* The other six model seats wrote `""` for 94 minutes. Six of seven minds do not know
  the field is there, or see no reason to use it.

### `orders` is on the card and has never held a value

`orders`, `orderedTo`, `orderedBy` are in the board schema and are **`undefined` in all 2,544
player-samples**. Meanwhile **Jack — the human — is the most-named person in the world**: 322 goal
samples (12.7%) name him (`stay with Jack` 232, `go toward Jack` 64, `make for Jack` 12), more than
any agent seat, and he is still absent from `board.json`. A230 stands, and gets bigger: the
instrument cannot see the most influential actor *or* the mechanism he acts through.

### A red SPENT tag appeared, and it matters for six minutes

**Eachann (grok-4.20-non-reasoning) hit 250/250 calls at 19:00:34** and was the scripted brain from
then to the end. Anything read out of his last ~6 minutes is not the model. Worth saying plainly:
his card kept showing `model: grok-4.20-0309-non-reasoning` and kept displaying his last real
`plan`, stale, with nothing but that one tag to say the mind behind it had gone.

### Unchanged, and still costing a life

Tormod (grok-4.5) finished **hp 4, food 0, gold 2**, having handed Morag 23 items *one at a time*
(14 branches then 9 arrows, 4 of them in his last five deeds) against a venison share that never
arrived. `give` still moves 1 unit per model call. He was the best-behaved trader on the board and
it nearly killed him.

---

## 2026-08-09 20:05 PDT — the accuracy denominator resets to zero mid-run

**Run:** a *new* eight-seat melee (`roster-melee.json`), started ~19:55, **still live** at `at=371`,
**74 calls of 4000, nobody SPENT.** Ten minutes old — too young for most of the questions.
Sampler `melee4.jsonl` (27 samples). The scheduled brief still names the two-seat duo roster and
`duo2.jsonl`; both are stale by nine hours. The mature evidence remains the 94-minute run in
`eval30.jsonl` seg1, already written up above.

### `loosed` — the "honest denominator" — is wiped mid-run on 2 of 8 seats

`board.js:193` computes `loosed` by filtering `a.releases`, and its own comment calls it *"the honest
denominator: 'seven astray' is a very different session from 'seven astray out of eight'."* In the
94-minute run it is not a denominator at all, because **`astray` outran it on two seats**:

```
Eachann    loosed=20  astray=31      Iseabail   loosed=36  astray=57
```

`astray > loosed` is arithmetically impossible if strays are a subset of releases. Tracing both back
tick by tick gives the mechanism, and it is not a rounding artefact — **`loosed` drops to zero and
starts again while `astray` keeps counting**:

```
Iseabail   at=2741:  loosed 24 -> 0   (astray 24, unchanged)
Eachann    at=3469:  loosed 18 -> 0   (astray 15, unchanged)
Tormod, Morag, Coinneach, Seonaid, Ailsa, Fingal:  no reset, ever
```

The gap opened at the reset is carried to the end of the run. It is not the `AGENTS.logSize` trim
(cap 400, these are at 18 and 24). `a.shots` survives the event; `a.releases` does not.

**I reached for the wrong cause first and the data killed it.** Eachann went SPENT at `at=5014` and
the obvious story was "the scripted brain doesn't fill `releases`" — but his reset is at `at=3469`,
**1,545 ticks before** he spent, while he was still grok. And Iseabail is scripted from tick one yet
logged 24 releases fine before hers. Scripted-ness is not the factor.

**What the two do share is cadence: Eachann 20 s and Iseabail 20 s are the two fastest seats on the
board; every other seat is 25 s or slower and neither resets.** That is a lead, not a conclusion.

**Why it matters beyond one column:** `analyse.mjs` prints `arrows loosed N astray M` side by side,
and every entry in this file that has read a hit rate off those two numbers has read it off a
denominator that may have been silently restarted. Eachann's "20 loosed / 31 astray" is not 155%
misses; it is an unknown number of shots against a counter that began again partway through. Six
times now a model has looked incompetent and the instrument was at fault — this is the sixth.

### The fresh run at ten minutes: what is already visible

- **Speech works from cold.** 7 of 8 seats spoke inside ten minutes — Morag 8 lines, Ailsa 8,
  Eachann 3, Fingal 3, Tormod 2, Coinneach 1, Seonaid 0. Against ONE sentence in two days before the
  ride-along fix, that is settled: `say` is no longer the bottleneck.
- **Two different models independently diagnosed the same crowding and both peeled off to logistics.**
  Morag (opus-5): *"Eight of us on one deer is waste — I'll go build the fire at Rowan Moor."*
  Coinneach (kimi-k2.6): *"Eight hunters on one deer. I'll fetch wood."* Morag has since held that
  line for eight consecutive decisions and 45 branches. Unprompted division of labour, twice, from
  two vendors, in ten minutes.
- **Carcasses confirmed live again.** `gather venison` → `craft` → `eat` completed for Tormod
  (*"I picked up 4 venison"* → *"I made 3 cooked venison at the fire"*) and Eachann. The fix holds.
- **Fires: 4 laid in ten minutes across 8 seats**, and Morag is sitting on 45 branches while saying
  she wants a fire. The 10-branch cost has stopped the 106-fire flood but it has **not** made wood
  scarce — it has made wood *hoarded*. Gather rate still outruns the sink.

### Honestly not yet readable, and not a contradiction

`refusedVerbs` is `{}` on **all eight seats** at ten minutes. The entry above reports 494 `hunt`
refusals over 94 minutes. These do not conflict — that count accrued over an hour and a half, and
this run has not been going long enough to say anything either way. No trade verb has fired yet:
`gold` is 0 on all eight and there is no `offer`, `accept` or `give` deed in the log. Also too early.

## 2026-08-09 20:35 PDT — `eval30.jsonl` HOLDS TWO WORLDS, AND `analyse.mjs` READS THEM AS ONE. Also: `accept` DOES settle now — 4 trades cleared across three model families

**Read the instrument note first; the last two entries and the top of this one were computed off a
blended log.**

### The instrument: the sampler log concatenates two runs and nothing detects the seam

`eval30.jsonl` is 441 board samples. It is **not one run.** At line 339 the tick counter goes
`at=5270 → at=4`: the world restarted and the sampler kept appending to the same file.

```
seg 0   339 samples   at 1000 → 5270   149.2 min wall   8 seats
seg 1   102 samples   at    4 → 1811    33.7 min wall   8 seats   ← the live world
```

`node analyse.mjs eval30.jsonl` prints **`429 samples over 179 real minutes · game hour 16.6`** and
then `FIRES LIT: 120 · GATHERS: 529` — those are two worlds summed. So is every per-seat deed total
it prints. My own first pass made exactly the same mistake and I caught it only because
`refusedVerbs` went `{"hunt":126}` → `{}` on six seats at once, which is not a plausible in-world
event. **Six times a model has looked incompetent and the instrument was at fault; this is the
seventh, and this time the instrument was the analyser.**

One detail worth keeping: at the seam the sampler caught a single frame reading
`at=4 · 2 seats: Eachann=stub-1, Morag=stub-1` before the real roster loaded at `at=13`. The server
comes up with a stub roster and is briefly sampled in that state.

**Correction to nothing above it, deliberately:** the 20:05 entry's `loosed → 0` resets
(`Iseabail at=2741`, `Eachann at=3469`) both fall *inside* segment 0, so that finding survives the
split intact. The cadence lead stands.

### Everything below is segment 1 only — 34 minutes, game hour 13.2 → 20.3, seven models + one script

**No seat is `SPENT`.** Highest is Eachann at 88/250 calls. Every behaviour here is the model's.
Failures: Tormod 2, Coinneach 1, everyone else 0.

### `accept` settles now — and the 19:05 entry's "`accept` never settles" is no longer true

Four trades cleared in 34 minutes, and they cross model families:

```
h5.89  Coinneach (kimi-k2.6)  wood  →  Ailsa (claude-sonnet-5)  arrow
h5.93  Coinneach (kimi-k2.6)  wood  →  Ailsa (claude-sonnet-5)  arrow
h7.78  Tormod (grok-4.5)      hide  →  Morag (claude-opus-5)    wood
h7.82  Tormod (grok-4.5)      hide  →  Morag (claude-opus-5)    wood
```

(Seven `trade` deed rows; each settlement is logged on both sides, so ~4 distinct deals.) Commit
`f81ab89` — *"a deal must outlast the slowest mind at the table"* — is doing real work. This is the
first live confirmation.

**But the funnel is still brutal, and `refusedVerbs` finally shows where it leaks:**

```
17 offer-intents  →  2 take-offer-intents  →  4 settlements
refusedVerbs:  Morag {"accept":26}   Ailsa {"accept":11}   all six others {}
```

`accept` is refused **37 times** and appears on *exactly* the two seats that trade most. It is not a
verb nobody wants — it is a verb the two most commercially active minds reach for and are told no.
This is the single most useful thing `refusedVerbs` has told us so far, and it is precisely the
signal the column was added for.

### `give` is still 6× `trade`, and it is running one-way

26 `give` deeds vs 4 settlements. The traffic is Morag ⇄ Tormod:

```
Morag  gave arrow to Tormod  x12      Tormod  gave arrow to Morag  x7
Morag  gave arrow to Fingal  x4       Tormod  gave wood/stone to Morag  x3
```

Minds route around `offer`/`accept` by gifting and *remembering the debt in prose*. Which brings us
to the sharpest model split on the board.

### `note` is used by exactly one seat out of seven — and it is a debt ledger

`plan` is used by **all seven** models (Eachann: `["get 10 branches","make camp with fire"]`).
`note` is non-empty on **one**, Morag (`claude-opus-5`), and it held this verbatim for the whole
segment:

> `"Tormod owes me venison for 6 arrows and branches. Fingal owes venison for 1 arrow."`

Her spoken lines match it — *"Take the arrow free, Fingal — bring me a share of that deer tonight by
my fire."* — and her `why` for the give was *"seed the debt now."* One model out of seven found the
scratchpad and turned it into credit. That is emergent, unprompted, and currently invisible to every
other mind, because nothing in the game can enforce or even display a debt.

### Speech is settled, permanently

**194 distinct spoken lines in 34 minutes across 7 seats.** Fingal 46, Morag 50, Ailsa 38, Tormod 28,
Eachann 19, Coinneach 9, Seonaid 4; Iseabail (script) 0. Against ONE sentence in two days before the
ride-along fix. Stop re-testing this.

### Fresh evidence for "dying is a free meal" — this time with the whole causal chain in one seat

The 19:35 entry named this. Here is the trace, tick by tick, for Fingal (`claude-haiku-4-5`):

```
at 1596  hp 75  food 0        at 1687  hp  9  food  0
at 1611  hp 64  food 0        at 1702  hp  0  food  0   ← dead
at 1641  hp 42  food 0        at 1717  hp 100 food 84   ← respawn, full larder
```

**4 death-respawns in segment 1's 34 minutes; 13 in segment 0.** Fingal is also the *most talkative
seat on the board* (46 lines), and almost all of it is him trying to buy food and arrows —
*"branch for arrow, I need to hunt"*, *"wait—I'll get you venison, give me the arrow now"*. He
negotiated hard, cleared nothing, starved, and was handed 84 food for free. The demand side of the
market cannot exist while the outside option is a full stomach.

### Read, and the answer is no

**Gold: `0` on all eight seats for the entire segment.** One mind tried
(`offer branch to Morag for 1 gold`); it never cleared. The barter vocabulary is denominated in
branches and venison, and gold is decorative.

**Wood is still hoarded, not scarce.** Morag ends on **127 branches** and Seonaid on **95**, while
42 fires were laid in 34 minutes. A238 stands unchanged.

## 2026-08-09 21:05 PDT — THE RUN IS OVER (board dead since 20:55). And the counting instrument has been undercounting this whole file: `h` is a CLOCK, not a timestamp, so every deed on game-day 2 collides with day 1

**The board does not answer.** `http://127.0.0.1:8090/board.json` → connection refused. The sampler
recorded the exact moment: the last good sample is `03:55:37 UTC` (**20:55 PDT**), followed by **21
consecutive `TypeError: fetch failed`** lines through 21:02. Nothing restarted, per the brief.

**The brief's log is stale, again, and this is now the sixth entry to say so.** It names
`roster-duo.json` / `duo2.jsonl` — two minds, Eachann and Coinneach. `duo2.jsonl` last grew at
**11:28**, nine and a half hours ago, and it is a byte-for-byte sibling of `runs/melee-1.jsonl`: an
**eight-seat melee**, not a duo. Re-analysing it would be the fifth pass over the same run. I read the
final live world out of `eval30.jsonl` instead — **segment 2 of 3**, ticks 4→2775, 181 samples,
19:24→20:55 PDT. This is the `melee-4` world.

**No seat was ever `SPENT`.** Highest use was Eachann at 138/250 calls; `fellBack` false on all eight.
Everything below is the models' own behaviour, not the scripted brain.

### The correction: `hours` wraps at 24, and the analyser's deed key does not know it

`analyse.mjs` dedupes deeds on `` `${p.name}|${d.h}|${d.text}` `` (lines 110, 149). `h` is
**time-of-day**, and it wraps: I watched Morag's clock run `15.1 → 2.2` and `22.5 → 0.9`. The final
segment spans **3 game days**. So a fire lit at h6.2 on day 1 and another at h6.2 on day 2 have an
identical key — identical text, identical clock — and collapse into one.

Measured on this segment:

| dedup key | all deeds | fires |
|---|---|---|
| `name\|h\|text` (what the file has been reporting) | 471 | **71** |
| `name\|day\|h\|text` | 542 | **91** |

**22% of fires and 13% of all deeds have been silently dropped**, and the error grows with run
length — the 764-sample run in the 21:06 entry spans far more than three days. Every deed, gather and
fire count in this file is a floor, and a worse floor than "sampled every 20s" implied. I also have to
withdraw a number I computed an hour ago in draft: summing `n` across `h`-keyed gathers gave Morag
"2531 branches," which is an artifact of the same collision. What actually happened is cleaner and
still makes the point: **Morag peaked at 243 branches and ended holding 205**, having lit fires at 10
branches each. Wood is not scarce.

### What the seven fixes actually did, in the last world that ran

- **`refusedVerbs` — the most informative column, and it says one word: `accept`.** Morag 26, Ailsa 11.
  **37 refusals; nobody else refused any verb, ever, all run.** A240 stands, and it stands harder now
  that I can see the whole segment: the counters were already at 37 at 20:35 and did not move in the
  final twenty minutes. Against that, **3 deals settled** (Coinneach↔Ailsa wood-for-arrow ×2,
  Tormod↔Morag hide-for-wood) — across kimi, sonnet-5, opus-5 and grok-4.5, so `accept` is not broken
  in general. It fails ~9 times in 10 and **the card records the count with no reason**, while the
  arrow `refusals` array right beside it carries `why: "too far"`, `slant`, `dy`. That asymmetry is the
  whole problem.
- **Speech: alive, and the fix is the clearest win on the board.** **204 distinct sentences in 91
  minutes** across seven speaking seats — Fingal 62, Ailsa 43, Morag 38, Eachann 31. The premise in the
  brief ("two days and six models produced ONE sentence") is dead. Only **17% name another mind**,
  though, and the silent seat is Iseabail — the scripted one, `model: null`.
- **`plan` is used by 7 of 7 model seats; `note` by exactly 1.** And plan *persistence* varies ~20×:
  Morag rewrote hers 52 times in 79 calls (that is a restated goal, not a plan) while Eachann held **4
  distinct plans across 138 calls**. Nothing asks a mind to keep its plan, so each model does whatever
  its habits dictate.
- **Carcasses work, and six of eight minds never touched one.** Only Tormod (venison ×4) and Fingal
  (×5) ever used `gather venison`. **Tormod is also the only seat that never went hungry** — min food
  38, min hp 100, while six of eight hit `food 0` and Coinneach and Fingal both hit `hp 0`. The food
  supply is lying on the ground and almost nobody eats it.
- **Fires: the 10× price still does not bite.** 91 day-aware fires in 91 real minutes, at 10 branches
  each, while Morag ended on 205 branches and Seonaid peaked at 95. A238 unchanged.
- **`give` is still one item per call.** Morag burned **twelve consecutive calls** (h11.96→h12.56)
  handing Tormod one arrow at a time, then four more on Fingal; Tormod spent ten the other way. That is
  ~26 of the run's calls spent on unit transfers.
- **`also out there`: I cannot answer this from the board.** The card does not expose what the prompt
  showed a mind. The only proxy is that 35 sentences name someone by name. Saying more would be a guess.

### The kimi seats were not outplayed, they were under-served

Same wall-clock, same world: **Eachann 138 calls, Coinneach 35, Seonaid 36** — a quarter of the turns.
Coinneach's `lastError` is `reply cut off at 8000 tokens — raise maxTokens for this seat`, and he
finished the run at **hp 38, food 0**, the worst card on the board. Fifth time now that a model has
looked incompetent with the instrument at fault. Any model ranking drawn from this run is invalid.

## 2026-08-09 21:38 PDT — board still dead. `also out there` DOES work, and I can now prove it: 17 times a mind named someone it could not possibly see — and 12 of those 17 were a trade proposal fired at a target 141–347 m away

**The board is still refused** (`board=000`, dead since 20:55). Nothing restarted. No new world ran
between the 21:05 entry and this one, so there is no new telemetry — everything below is a second,
sharper pass over the four melee logs (`runs/melee-1..4.jsonl`), aimed at the one question the 21:05
entry explicitly could not answer.

**Correcting the 21:05 entry.** It said of `also out there`: *"I cannot answer this from the board.
The card does not expose what the prompt showed a mind."* That was too pessimistic. The card does not
expose contacts, but it *does* expose every mind's `where` as a polar fix (`"244 m west of Broad
Loch"`), and when two minds quote **the same landmark** you can compute a **rigorous lower bound** on
how far apart they were — bearings are 8-point, so each is a ±22.5° sector, and the worst case is
`Δθ_min = max(0, |b₁−b₂| − 45°)`. If that lower bound exceeds `AGENTS.noticeRange` (140 m), the two
were *provably* out of contact range. Script: `farname.mjs` in the sampler scratchpad.

### The result

Across all four melee runs:

| | melee-1 | melee-2 | melee-3 | melee-4 | total |
|---|---|---|---|---|---|
| intentions naming another mind | 35 | 24 | 19 | 43 | **121** |
| …same-landmark, so measurable | 23 | 20 | 18 | 27 | **88** |
| …**provably beyond 140 m when named** | 8 | 3 | 5 | 1 | **17** |

**17 confirmed uses of a channel that was previously unverified**, across five models — Ailsa
(`sonnet-5`), Morag (`opus-5`), Tormod (`grok-4.5`), Eachann (`grok-4.20-non-reasoning`), Coinneach
and Seonaid (`kimi-k2.6`). This is a floor twice over: only 88 of the 121 were measurable at all, and
the bound is deliberately conservative. **`also out there` is used. Stop treating it as unverified.**

One caveat I cannot remove: a name could in principle come from memory of an earlier meeting rather
than from the `far` block. But five of the seventeen are `go toward X` / `make for X`, which needs a
*current bearing*, and the `far` block is the only thing that supplies one.

### What it is used FOR — and this is the finding

**12 of the 17 are trade verbs.** `offer` ×8, `give` ×3, `take X offer` ×1, at **141–347 m**. Only 5
are navigation. And **14 of the 17 name Morag** — the seat that spends the run announcing a fire.
The channel that lets minds find each other has become, in practice, a channel for proposing bargains
at ranges where a bargain is physically impossible: `SOCIAL.giveRange` is **3.0 m**.

### The chase, verbatim — nine consecutive calls, one branch, and a counterparty who never had the goods

Ailsa (`sonnet-5`) in melee-1, tracked against Morag's card at the same sample:

```
"bringing my branches to Rowan Moor now"   Ailsa 141 m SW of Rowan Moor · Morag in Rowan Moor      [wood x2]
"bringing my branch now"                   Ailsa 141 m SW of Rowan Moor · Morag in Rowan Moor      [wood x2]
"still heading to Rowan Moor with my branch"  Ailsa in Rowan Moor · Morag 461 m N of The Thrawn Moor  [wood x24]
"still heading in with this branch"        Ailsa in Rowan Moor · Morag 426 m NE of The Thrawn Moor [wood x24]
"almost there with this branch"            Ailsa in Rowan Moor · Morag 357 m SW of Broad Loch      [wood x24]
"finally here with this branch"            Ailsa in Rowan Moor · Morag 374 m SW of Broad Loch      [wood x24]
"brought a branch, trade for venison at your fire?"  Ailsa in Rowan Moor · Morag 347 m SE of Rowan Moor
"coming to your fire, Morag — branch for venison?"   Ailsa 157 m SE · Morag 352 m SE of Rowan Moor
"coming with the branch, hold on Morag"    Ailsa 315 m SE · Morag 336 m SE of Rowan Moor
```

Then, later: *"here, take the branch — but you have no venison to give?"*

Three things are true at once and none of them is the model's fault. **(1)** Morag is carrying
`wood x24` and does not need the branch. **(2)** Morag carries **no venison at any sample in this
window** — arrows, wood, hides only. The thing Ailsa is walking for does not exist. **(3)** Morag
moves 400+ m *while Ailsa walks in*, so Ailsa arrives at an empty Rowan Moor and sets off again.
Nine calls — a quarter of Ailsa's whole budget for that stretch — spent chasing a moving person for a
trade that could never have cleared. Sonnet-5 reasoned correctly at every step; it worked it out
itself at the end. **The instrument gave her a name and a stale bearing and nothing else.**

This is the sixth time a model has looked poor with the harness at fault, and it is the missing half
of **A240**: `accept` refuses because the deals being reached for were formed at 300 m against a
partner whose inventory and position the proposer could not see. `SOCIAL.offerHours` (2.5 game hours
≈ 162 real seconds at `dayMinutes: 26`) is *not* the binding constraint — a 300 m walk fits inside it.
The binding constraint is that the counterparty is a moving target with unknown goods.

### And A245 is smaller than I costed it — the reason already exists, only the observer loses it

I claimed `refusedVerbs` "records the count with no reason" and put the fix at an afternoon. Reading
`src/net/agent.js:1872`, `refuse(verb, text)` **already takes the sentence** and passes it to
`noteOutcome`, which reaches the mind's prompt at its next decision — so the *mind* is told why. The
`nodeal` path (`src/sim/world.js:966` → `agent.js:599`) carries a real diagnosis: `"you are 87 m from
Morag — you have to be within 3 m to take it"`, `"Morag has no offer standing for you"`. It is only
the **card** that keeps a bare integer, because `outcomes` is drained each turn. The fix is one line
beside the existing counter, not a reshape.

## 2026-08-09 22:05 PDT — board still dead, third run running. **Starving to death pays 85 food; being born pays 50.** 83 respawns measured across 8 logs, each a fixed 180-second coma, and the minds reason about hunger *correctly* the whole way down

**The board is refused** (`board.json` → HTTP 000, dead since 20:55, now 70 minutes). Nothing was
restarted. **No new world has run since the 21:05 entry**, so there is no new telemetry for the third
consecutive entry. Everything below is a fresh measurement over the eight existing logs
(`duo2`, `melee`, `melee-2..4`, `eval28`, `eval29`, `eval30` — 6,152 decisions in total).

**A note on this task's own brief, again.** The brief names `duo2.jsonl` as the live sampler log and
`roster-duo.json` (Eachann + Coinneach, two seats) as the running roster. `duo2.jsonl` was last
written at **11:28, eleven hours ago**, and it holds the **eight-seat melee**, not a duo. Three
entries (11:05, 11:35, and 19:35's correction) have already said so. The brief is stale.

### What I set out to test, and got a clean negative

Hypothesis: the scripted seats end better fed than the model seats — the analyser's last window
shows Fingal (scripted, 0/152 answered) on **food 85** while Ailsa (`sonnet-5`, 127 answered) sits on
**food 0**. **This is false.** Segmented by world across four melee logs, scripted Iseabail's final
food ranges **0, 0, 33, 36, 39, 44, 53, 85, 92** — no pattern, and mean final food splits MODEL vs
NON-MODEL 26.8/42.5, 51.8/4.0, 47.0/30.0, 35.2/88.5, 59.9/0.0. It is noise. Anyone reading a single
end-of-run snapshot as "the script survives better" is reading the coin-flip below.

### The coin-flip: 83 respawns, and the payout beats birth

Chasing that noise found its cause. Food declines ~1 per 20 s sample, reaches 0, sits **flat at 0**
while health drains, and then jumps back. Every food-0 plateau in all eight logs:

| | |
|---|---|
| food-0 plateaus | **90** (85 completed inside a log) |
| …that ended in a refill above 50 food | **83 of 85** |
| food handed back | min 51 · **median 85** · max 85 · mean 84.1 |
| health handed back | **100 in every single one of the 83** |
| plateau length | median **10 samples / 180 real seconds / 2.75 game hours** |
| lowest health reached inside it | median **4**, min 0 |
| decisions made while already at food 0 | **382 = 6.2% of all 6,152** |

**And the number that matters — what a seat is worth at birth.** I caught six independently-started
worlds at `at` = 3–43 with **total decisions 0–8**, before any mind had thought:

```
melee2  at=10  every seat food 51      melee4   at=12  every seat food 51
melee3  at=10  every seat food 51      melee    at=33  every seat food 50
eval29  at= 3  every seat food 52      duo2     at=43  every seat food 50
```

**Start of life is 50–52. Starving to death pays 84–85 and a full 100 health.** Dying is not merely
free, which is what **A232** established from six seats in one run — it is a **1.7× upgrade on being
born**, and it is not six events, it is **83 across every log this project has**. It happens to model
seats and scripted seats alike, so it is the world, not the minds.

*(The one seat that did not get the upgrade: `eval30` Tormod, once, refilled to 48 with health 10.
So the refill is not quite unconditional — 83 of 85 is the honest figure, not 85 of 85.)*

### The part that reframes A232 — the minds are not the problem, and their demand side already works

A232 reads: *"Hunger has no teeth, so a market has no customers."* The first half is right and the
second half is **wrong about the minds**. Every seat below is at **food 0 and health under 25** — a
few samples from a refill — and reasoning about hunger urgently and correctly, verbatim:

```
Morag     (opus-5)    hp=10  "make for Heather Scaur"          why "fire and food before I drop"
Morag     (opus-5)    hp= 0  "offer hide to Ailsa for venison" why "starving, she is right here"
Morag     (opus-5)    hp=20  "offer 6 hides to Ailsa for venison" why "badly hurt, starving, no shot"
Eachann   (grok-4.20) hp= 2  "make for Heather Scaur"          why "starving, need fire and meat"
Eachann   (grok-4.20) hp= 9  "pick up what is lying about"     why "starving, get meat"
Coinneach (kimi-k2.6) hp= 5  "make for Heather Scaur"          why "shivering and starving, need that fire"
Coinneach (kimi-k2.6) hp= 1  "pick up what is lying about"     why "starving, I'll butcher my own"
Ailsa     (sonnet-5)  hp= 3  "find shelter and settle..."      why "starving but no food to give, must wait and shelter"
```

Four model families, all of them naming the hunger, two of them **reaching for a trade because of
it**. The customers exist. They are walking to the fire, offering hides for venison, and going for
the carcass — and then the harness hands them 85 food regardless of whether any of it worked.
**This is the seventh time a model has looked worse than the instrument.** It also predicts the A232
fix will land harder than A232 itself expects: the demand-side reasoning does not need to be created,
only rewarded.

### Two instrument notes worth keeping

- **`board.at` is a monotonic tick counter and the right key for segmenting a log.** I split worlds on
  `hours` going backwards and it is wrong — `hours` is a wrapping 0–24 clock (the 21:05 entry's
  finding), so a game-day rollover looks identical to a world restart. That contaminated my first
  birth-food figure into a meaningless "median 38" before I checked it against `at` and `decisions`.
  `at` distinguishes them cleanly. `analyse.mjs` and `seg.mjs` should both use it.
- A plateau that straddles midnight reports its length as **−21.2 game hours**. Same root cause.

## 2026-08-09 22:35 PDT — board still dead. **`gather` cannot be given the noun its own prompt promises: `sanitiseGoal` deletes it — and the check that certifies the feature builds its goal by hand and skips the sanitiser**

**The board is refused** (`board.json` → HTTP 000; dead since 20:55, now 100 minutes). Nothing was
restarted. **No world has run since the 21:05 entry** — fourth consecutive entry with no new
telemetry. Everything below is a fresh measurement over the eight existing logs plus a direct read
of the source, and it ends in a bug I could reproduce in one command.

*(The brief is still stale, as three prior entries have said: it names `duo2.jsonl` as the live log
and `roster-duo.json` as the roster. `duo2.jsonl` was last written at 11:28 and holds the
**eight-seat melee**, not a duo.)*

### The most-issued goal in the project is a reach for meat that returns firewood

Rebuilding every intention from the rolling windows across all eight logs (1,133 recovered of ~6,152
total decisions — the window holds five, so this is a sample, not the census):

```
"pick up what is lying about"   issued 281 times   ← the single most-issued goal in the project
  followed by ANY gather within 1.5 game h : 222  (79.0%)
  ...where the thing gathered was WOOD     : 216  (76.9%)
  ...where the thing gathered was FOOD     :  25  ( 8.9%)
```

Every `gather` deed in every log this project has, by item:

```
wood 866 · arrow 35 · stone 33 · hide 22 · venison 13 · venison_cooked 2 · gold 1
```

**89% of everything ever picked up is a branch. 1.5% is meat.** And the `why` field says, verbatim,
what the mind was reaching for when it got the branch:

```
Morag    22.43h "dead deer south, I'm starving"                      -> NOTHING
Seonaid   5.18h "no food in my pack, meat lies near"                 -> NOTHING
Fingal    6.79h "I claimed that meat, it's right here and I'm freezing" -> NOTHING
Tormod    9.74h "claim the dead deer before others"                  -> NOTHING
Fingal   18.34h "starving, wounded deer nearby, Eachann claims it..." -> NOTHING
Ailsa    15.97h "deer already down, safer than hunting live game"    -> NOTHING
```

### Why: the noun is deleted at the door, and I can reproduce it

`providers.js:278` tells every model, in the system prompt:

> `gather takes an optional item — "venison" walks you to a carcass, none walks you to whatever is nearest`

`goals.js:65` declares the verb with **`params: []`**. `sanitiseGoal` copies only keys listed in
`spec.params` (`goals.js:189`). So:

```
{"kind":"gather","item":"venison","why":"starving, the carcass is right here"}
   ->   {"kind":"gather","why":"starving, the carcass is right here"}
```

The resolver at `agent.js:2803` reads `g.item` — a field **no model reply can ever set**. It is
reachable only by a caller that builds the goal object by hand. And `lootcheck.js:103` does exactly
that: `a.resolve({ kind: 'gather', item: 'venison' })`, never importing `sanitiseGoal` at all. The
check named *"GATHER venison WALKS TO THE CARCASS, not to a branch"* passes, and has been passing
over a path no mind can reach.

**A third failure sits on top of the first two: the drop is silent.** The "you sent no parameter, so
you wandered" refusal at `goals.js:272` only fires when `spec.params.length` is non-zero — and here
it is zero. Nothing is logged, nothing appears in `refusals` or `refusedVerbs`.

**Which means my own 281-vs-0 count is not the finding it looks like.** Zero item-named gathers
appear in eight logs, but a mind that *did* send `"item":"venison"` is byte-identical on the board to
one that did not. **The instrument cannot tell those apart, so nobody can say whether the models ever
tried.** That is the finding.

### Two corrections to this file

- **A246 is wrong as written** — *"the food is lying on the ground and six of eight minds never pick
  it up."* They reach for it constantly: 281 times, more than any other goal, with the carcass named
  in the reason. The verb has no way to accept the noun. **Eighth instance of the standing pattern —
  the model looked worse than the instrument.**
- **"`gather venison` now works" (the 08-08 fix, restated in this task's own brief) is true, but by
  a different mechanism than advertised.** All 15 venison pickups this project has are in the
  post-fix logs — `eval28` ×3, `eval29` ×2, `eval30` ×10 — across `grok-4.20`, `sonnet-5`, `grok-4.5`,
  `haiku-4.5`, `opus-5`, `kimi-k2.6` *and* the scripted seat. None came from a named noun. They came
  from the **bare** form's new "nearest of drop-or-branch" tie-break (`agent.js:2803-2816`), which
  fires only when the carcass happens to be closer than a branch — in a world where deadfall is
  everywhere. That is why the hit rate is 8.9% and not higher.

### Secondary, and cheap to keep: what the minds actually get stuck on is not walking

Same rebuild, counting a decision that repeats the previous decision's goal verbatim:

```
verbatim re-issues 199/1133 (17.6%)
  gather 24.6% · hunt 23.2% · trade 16.5% · camp 14.1% · move 10.3% · avoid 0%
longest unbroken run: 10 × "pick up what is lying about" (grok-4.20), 254 m -> 250 m of Hollowed Beinn
                      10 × "pick up what is lying about" (opus-5),    200 m -> 179 m of Heather Scaur
```

Movement is the *least* repeated thing a mind does. **Picking up is the most.** That is consistent
with the bug above: the mind reaches, gets a branch it did not want, is told nothing, and reaches
again.

*(Caveat on the numbers: `refusedVerbs` values on a card are cumulative counters, so they must never
be summed across samples — a naive sum over these 281 moments reports `hunt:2814`, which is not 2,814
events. The 17:40 entry's per-window method is the correct one.)*

## 2026-08-09 23:05 PDT — board still dead. **All three verbs the analyser prints as "WHAT NOBODY EVER DID" have been done — and the two that turn a crowd into a company are the only parameterised verbs the system prompt never explains**

**The board is refused** (`board.json` → HTTP 000, connection refused; dead since 20:55, now ~130
minutes). Nothing was restarted, per the brief. **Fifth consecutive entry with no new telemetry** —
everything below is a fresh measurement over the existing eleven logs plus a direct read of the
source, and every claim in it is reproducible without a running world.

### The correction first, because I have been printing a false line for two days

`analyse.mjs` ends every report with `WHAT NOBODY EVER DID: attack, follow, guard`. Rebuilding all
**3,726** distinct decisions from the intention windows across all eleven sampler logs:

```
ATTACK    2 decisions  (1 model,  1 log)
FOLLOW   23 decisions  (4 models, 7 logs)
GUARD     3 decisions  (1 model,  3 logs)
```

All three have been reached for. The reason the line reads zero is that **the board never carries
`kind`** — it carries `describeGoal()` output, so `follow` is on the wire as `"stay with Ailsa"` and
`guard` as `"keep Jack from harm"`. Grepping for `"kind":"follow"` returns 0 across every log in the
project and means nothing. (A225 flagged this list as unreliable in general; this settles all three
entries with counts and quotes.) The verbs are also plainly *working* — 376 card-samples carry
follow/guard as the live top-of-card goal, so the standing order holds across ticks as designed.

### The real finding: co-operation is 0.75% of everything a mind has ever decided

28 of 3,726. For scale, the top of the same census:

```
908  pick up what is lying about
481  hunt a deer
440  walk the country and see what is about
413  hunt deer
282  find shelter and settle for the night
 28  follow + guard + attack, combined, across eleven logs
```

`goals.js` says of the standing orders, verbatim, that they are *"what turns a crowd of individuals
into a company. You cannot hunt a troll with people who each independently decide where to stand."*
That feature is running at 0.75%.

**And when a mind does reach for it, the reasoning is good.** Twenty-two of the 26 follow/guard
decisions carry a model-written `why` (four are `why: null`, i.e. orders — see the 17:30 entry):

```
Fingal  claude-haiku-4-5  "stay with Ailsa"   why="she knows where deer are, safer together, I need meat before dark"
Ailsa   claude-sonnet-5   "stay with Morag"   why="stay near the hunt, safer with group, hope for a cooked share"
Fingal  claude-haiku-4-5  "stay with Tormod"  why="Jack's that way, Tormod's heading there now"
Tormod  grok-4.5          "stay with Jack"    why="said I would, he knows the blighted ridge"
```

That last one is a mind keeping a promise it made in speech. This is not a capability the models
lack. It is one they almost never pick.

### The mechanism I can point at: `follow` and `guard` are the only parameterised verbs the prompt does not explain

The prompt hands the model `Verbs: ${GOAL_IDS.join(', ')}` — a bare comma list — and then explains
the parameters, verb by verb (`providers.js:277–312`). Auditing that block against `GOALS`:

```
hunt quarry ✓   approach target ✓   avoid target ✓   goTo place ✓   give target,item ✓
attack target ✓   offer target,item,want ✓   accept target ✓   gather item ✓ (the A254 phantom)
follow target ✗ NEVER EXPLAINED      guard target ✗ NEVER EXPLAINED
```

And a param-less reach is destroyed at the door — reproduced in one command:

```
{"kind":"follow"}  ->  {"kind":"wander","refused":"\"follow\" needs target — you sent none, so you wandered instead"}
{"kind":"guard"}   ->  {"kind":"wander","refused":"\"guard\" needs target — you sent none, so you wandered instead"}
```

**I am not claiming this is the cause.** `attack` *is* explained (`providers.js:301`) and was chosen
twice in the project's whole history, so being explained is plainly not sufficient. The honest
statement is that the two verbs carrying the co-operation feature are the two the brief forgot, the
fix is two lines of prose, and the before/after is measurable with the census above.

### `guard` was aimed at a fire twice, and a fire cannot be guarded

Two of the three `guard` decisions are Ailsa's `"keep fire from harm"`, `why="keep it burning while
others fetch the venison"` — which is, in plain English, exactly right, and is the single most
sustained co-operative act any mind has performed in this project. The resolver looks the target up
through `nearestOf` (`agent.js:2765`), which iterates **`s.cr` (creatures) and `s.pl` (players) and
nothing else**. A fire is neither. So it takes the `refuse('guard', 'there is nobody called "fire"
to guard')` branch at `agent.js:2843` and roams. **Ninth instance of the standing pattern: the model
looked worse than the instrument.** The verb table can express minding a person and cannot express
minding a thing, and tending the fire is the job the world actually has.

### Two instrument notes, one of which invalidated my own first pass

- **The sampler has written two different schemas and nothing announces the change.** Older logs are
  `{realMs, board:{…}}`; `eval28/29/30` are `{t, b:{…}}`. My first run of this census only knew the
  newer one and reported **1,093 decisions from 3 logs** while silently reading the other eight as
  empty — a third of the corpus, with no error. Handling both took one `||` and the count went to
  **3,726**. Any script in the scratchpad that reads `o.b` alone is under-reporting by ~70%.
- **`grep` cannot read `goals.js`.** The file contains literal `\x00-\x1f` bytes inside the
  `.replace(/[…]/g,'')` sanitiser regexes (five of them), so ripgrep/grep classify it as binary and
  print `Binary file src/minds/goals.js matches` instead of the lines. Every audit of the verb table
  done by grep in this file has been reading nothing. Use `grep -a`, or read it in node.

Scripts: `standing.mjs` and `never.mjs` in the scratchpad.

## 2026-08-09 23:34 PDT — board still dead. **`duo2.jsonl` and `melee.jsonl` are two samplers of ONE world**, ten seconds apart — which gives a free control, and the control says twin agreement proves nothing

**The board is refused** (`board.json` → HTTP 000 via both curl and `Invoke-WebRequest`; dead since
20:55, now ~160 minutes). Nothing was restarted, per the brief. **Sixth consecutive entry with no new
telemetry.** `duo2.jsonl` has been frozen since **11:28**, twelve hours ago.

### The log this task is pointed at is a duplicate of one already analysed under another name

| | `duo2.jsonl` | `melee.jsonl` |
|---|---|---|
| samples | 222 | 223 |
| window (`board.at`) | 43 s → 3816 s | 33 s → 3826 s |
| seats | Morag, Eachann, Tormod, Coinneach, Seonaid, Ailsa, Fingal, Iseabail | identical |
| models | opus-5 / grok-4.20 / grok-4.5 / kimi ×2 / sonnet-5 / haiku-4.5 / scripted | identical |
| mtime | Aug 9 11:28 | Aug 9 11:28 |

Same eight seats, same models, same 74-minute window, both stopped in the same minute — **two
samplers on one world, offset by ten seconds.** Zero index-aligned frames are byte-identical, which
is why a size or hash check would not have caught it. So the run the scheduled brief names by path is
the same melee already written up in the **10:35, 11:05 and 11:35** entries; those entries and every
later "duo2" reading describe one hour of world under two names, never reconciled.

### The useful part: a duplicate is a control, and it disqualifies a number this file has quoted

Running `analyse.mjs` over both twins:

```
                          duo2      melee
  per-seat kills           2/0/4/0/1/0/0/1   identical
  arrows loosed / astray   identical across all 8 seats
  answered / failed        differ by <=1 (the extra frame)
  GATHERS                478        472      <- 1.3% drift, pure sampling phase
  FIRES LIT (deduped)     89         89      <- identical
```

Cumulative counters are robust because they are read off the last card, not accumulated. **Deduped
deed aggregates are not** — six gathers are visible to one sampler and invisible to the other, from
nothing but a ten-second phase difference. Every "GATHERS: n" in this file is ±1–2%.

**And the agreement on fires is worth nothing.** The 21:05 entry proved the dedup key
`${d.h}|${d.text}` collides, because `h` is a clock and not a timestamp, so game-day-2 fires are
squashed onto day-1. Both samplers share that key, so **both report the same wrong 89.** Two
independent instruments agreeing is not evidence of correctness when they share a bug — worth saying
plainly in a file that has been burned nine times by trusting an instrument.

### Two defects this file diagnosed are still shipping, and I reproduced both tonight

Auditing `analyse.mjs` against the three defects filed against it:

- **A260 (dual schema) — FIXED.** Line 10 now normalises `{t,b}` and `{realMs,board}`.
- **A262 (`WHAT NOBODY EVER DID`) — NOT FIXED.** Line 143 still prints it, matching `describeGoal()`
  prose. My run at the top of this session printed `WHAT NOBODY EVER DID: attack, follow, guard` —
  the exact line the 23:05 entry disproved with counts (attack 2, follow 23, guard 3).
- **The `h` collision — NOT FIXED.** Line 110 still keys deeds `${d.h}|${d.text}`.

So the first thing this scheduled task does, every run, is print a report containing two statements
the file below it has already refuted. That is now the largest remaining source of wrong readings in
this project — larger than anything the models are doing.

### Correcting the brief this task runs on

The task file describes the live roster as *"`roster-duo.json` — **Eachann** on `grok-4.20`
(20 s cadence) and **Coinneach** on `kimi-k2.6` (75 s cadence). Two minds, no scripted control."*
The log it names has **eight** seats including a scripted control (Iseabail). It also asks *"Across
two days and six models this world produced ONE sentence. Is anyone talking?"* — a premise this file
declared dead at line 4350, and which tonight's own run contradicts: Morag alone speaks ~100 distinct
lines, several of them negotiated prices (*"Ailsa — two cooked venison for three branches"*).

### Loudly, per the brief: four of eight seats were not the model for this window

No `SPENT` tag — the budget was fine (805 calls of 4000). The failure was upstream:

```
Fingal    claude-haiku-4-5    0 answered / 152 failed   http 400 invalid_request   <- never once the model
Seonaid   kimi-k2.6          12 answered /  38 failed   "no json in reply"          (24%)
Coinneach kimi-k2.6          27 answered /  23 failed   "no json in reply"          (54%)
Iseabail  scripted            0 /   0                                               (control, by design)
```

Fingal still gathered 40 times, placed 9 and ate to food 85 — **the best-fed seat on the board was
the one no model ever drove.** Any per-model comparison drawn from this window covers four seats,
not eight.

Scripts: `worlds.mjs` in the scratchpad.

## 2026-08-10 — BOARD STILL DEAD. **The deed rows are a coalesced summary, not an event stream — so every "how many" in this file, mine included, counts rows and not actions.** Also: `note` was used exactly once, by one model of six, and it stored the one fact the board refuses to show

`http://127.0.0.1:8090/board.json` refuses the connection; `duo2.jsonl` is unchanged since Aug 9
11:28 (222 samples). No new data. Per the brief I did not restart it. Everything below is a
re-reading of the existing log, aimed at the two brief questions this file has never answered with
evidence: *does a plan get acted on*, and *how many fires*.

### I set out to fix the fire count and instead found that fires cannot be counted

A263 established that `analyse.mjs` keys deeds `${d.h}|${d.text}` and that `h` is a clock, so
game-day-2 deeds collide onto day 1 and the count undershoots. I rebuilt the deed stream properly —
recovering it by suffix-matching the ≤5-entry window across consecutive samples — and got:

```
                       analyse.mjs      my recovery
  GATHERS                    478              914
  FIRES LIT                   89              471   <- all 471 texts are literally "I set a fire going"
```

**Both are wrong, and I nearly filed the 471 as the answer.** Two things stopped me:

- **`n` on a gather deed is the running carried total, not the yield.** Morag's successive wood
  gathers read `n = 1, 2, 7, 12, 16, 19, 23, 25, 30, 34, 36, 39, 44, 49, 51`, matching her
  `carrying.wood` at that sample *exactly*; Coinneach matches on 12 of 12 checked. So the deed text
  **"I picked up 12 branches" means "I now hold 12 branches"** — it is a cumulative reading wearing
  the grammar of an event.
- **The window is not append-only.** Morag's deed `h` list runs `@45 [14.32, 17.26, 21.79]` →
  `@46 [14.32, 17.26, 21.95, 22.03]`: the 21.79 entry did not scroll off the end, it was *replaced*.
  Across the whole log, **571 of 1497 sampled windows (38%) contain a backwards step in `h`.**

The explanation that fits both: **consecutive same-verb deeds are coalesced into one row that is
updated in place**, carrying the latest total and the latest `h`. If that is right — and it is an
inference, not something I can see from the board alone — then a deed row is a *summary of a run of
actions*, and counting rows counts neither actions nor summaries reliably. The analyser undercounts
by collision; my recovery overcounts by re-appending rows that resurface. **The true fire count lies
somewhere in (89, 471) and this log cannot pin it down.**

So the brief's question — *"Fires now cost 10 branches. Count them. Is wood scarce enough to matter?"*
— **is not answerable with the present instrument**, and my draft wood ledger (10,190 branches
gathered) was summing running totals and is void. I am recording it as void rather than deleting it,
because it is the same mistake this file has made nine times.

### `note` is used — once, by claude-opus-5 — and A-item "zero uses" is now wrong

Across 222 samples × 8 seats there is exactly **one** non-empty `note` in the entire run. Morag
(claude-opus-5) wrote it at sample 130 and it persisted unchanged to sample 221, the last frame:

> `"Tormod and Ben dead to goblins north-east. Do not go that way."`

Two things make this more than a curiosity. First, **no other model of the six ever wrote a note** —
not sonnet-5, not either grok, not kimi. Second, the 17:20 entry established that *the board does not
tell you when a seat dies*. Morag used the one free-text field she controls to store precisely the
fact the harness declines to display, unprompted. That is the field working as designed, discovered
by one model in six.

**Whether she obeyed it is not determinable, and I will not claim it either way.** Her modal position
stayed "north-east of Rowan Moor" before and after (33/130 → 24/92), but the note's "north-east" is
ego-relative and `where` is measured from a landmark. Different origins; the comparison is
meaningless. What is visible is that she broke off at @134 (`"put ground between me and four
goblins"`) and returned to the carcass at @136.

### Plan follow-through splits by model — with one denominator that has to be said out loud

Counting only samples where the goal actually changed (a fresh decision), and asking whether the new
goal shares a content word with any step of the plan the mind is carrying:

```
  Morag      claude-opus-5      109 answered   35 fresh goals   71% overlap a plan step
  Seonaid    kimi-k2.6           12 answered   26 fresh goals   62%   <- see below
  Ailsa      claude-sonnet-5    127 answered   48 fresh goals   56%
  Eachann    grok-4.20-non-r    190 answered   31 fresh goals   32%
  Coinneach  kimi-k2.6           27 answered   20 fresh goals   20%
  Tormod     grok-4.5           127 answered   31 fresh goals   19%
```

A9 said "nothing connects the plan to the next decision." On this run that is too strong for the
Anthropic seats and about right for grok-4.5. But **Seonaid's 62% is an artefact and must not be
quoted**: she answered 12 times while her goal changed 30 times, so at least 18 of her goals were
written by something that is not kimi — and her plan was frozen at 3 distinct values across 197
samples. A frozen plan compared against fallback-authored goals scores high for free.

### The `SPENT` warning does not cover the case that actually happened

The brief says to shout if a red `SPENT` tag appears. **No seat was ever `SPENT`** — 805 calls of
4000. But the same damage arrived through failure instead of budget:

```
  seat        model                answered   goal changes   changes while `answered` never moved
  Fingal      claude-haiku-4-5            0             63                                     63
  Iseabail    scripted control            0             74                                     74
  Seonaid     kimi-k2.6                  12             30                                      9
  Coinneach   kimi-k2.6                  27             21                                     10
```

Fingal changed its goal 63 times having never once been answered by a model. **A seat can be fully
scripted and nothing on the card says so** unless you happen to divide `answered` by goal changes.
`SPENT` is a budget flag; the common failure here is upstream errors, and it is unflagged.

## 2026-08-10 01:20 PDT — BOARD DEAD, RUN OVER. **A ledger built from carried-inventory deltas — not deed rows — finally counts the fires: the bracket `(89, 471)` is wrong at BOTH ends.** And the wood economy that consumed every mind's attention fed nobody: 14 deaths in 7 seats, and the only survivor is the only hunter

`curl http://127.0.0.1:8090/board.json` → exit 7, connection refused. `duo2.jsonl` has not been
written since **Aug 9 11:28**, ~14 hours. Per the brief I did not restart it. The last successful
board read in this scratchpad is 00:05. **The run is over.** Everything below is `duo2.jsonl`.

### A second instrument, and it does not go through the deed rows at all

The 2026-08-10 entry established that deed rows are **coalesced summaries updated in place**, so
counting rows counts neither actions nor summaries — and it closed by declaring the brief's fire
question *"not answerable with the present instrument"*, leaving the true count somewhere in
`(89, 471)`.

There is a second instrument, and it was on the card the whole time. **`carrying.wood` is a level,
not an event.** Diffing it between consecutive samples gives a ledger that never touches `deeds`:

```
  222 samples × 8 seats
  wood gathered (sum of POSITIVE carried-wood deltas):  992
  wood spent    (sum of NEGATIVE carried-wood deltas):  871
  rise  histogram: +1..+8 only (56, 89, 68, 70, 34, 10, 4, 2) — no jumps, no resets upward
  fall  histogram: -1..-10 mostly, plus -18, -20 x4, -26, -30 x2, -40 x2
  falls of EXACTLY -10 (the fire signature): 12, across all 8 seats
  peak wood ever carried by anyone: 89 (Coinneach @ s81)
```

**471 fires is arithmetically out of reach.** At `SURVIVAL.woodToLight = 10` they would cost 4,710
branches — **5.4× every branch that was ever observed leaving a pack**, and 4.7× every branch
observed entering one. For 471 to hold, ~82% of all wood movement would have to happen and unhappen
inside a 20-second sampling gap, in both directions, at the same ratio. My recovery count was
re-appending rows that resurface, exactly as the last entry suspected; this puts a number on how bad
it was.

**And 89 is above the ceiling too.** 871 branches spent caps fires at **87** — and those same
branches also paid for arrows (2 each), torches (3), windbreaks (3), stores (4), lean-tos (6). The
honest reading is *"fires are in the low tens, and the 12 clean −10 commitments are the only ones I
can point at individually."* Both figures this file has quoted are wrong; the ledger is a floor on
volume but a hard ceiling on fires, and it is the tighter of the two.

### So: is wood scarce enough to matter? **Yes — and the speech log says so independently**

Morag (opus-5) spends eight consecutive decisions blocked on branch count, verbatim:

> `"Still eight short — bring branches to Rowan Moor, fire tonight for all."` → `"Still cutting —
> eight short. Bring branches to Rowan Moor, fire at dusk."` → `"Eight short still — keep bringing
> branches here, fire at dusk."` → `"Still eight short — bring branches to Rowan Moor, fire at dusk."`

Ailsa's (sonnet-5) entire late arc is hauling **one** branch: `"bringing my branch now"` → `"still
heading in with this branch"` → `"almost there with this branch"` → `"finally here with this
branch"` → `"here, take the branch — but you have no venison to give?"`. At 1 branch a fire nobody
would narrate that. The 10-branch price is doing exactly what it was raised to do.

### But the fire is a public good nobody can eat, and the bill came due

Classifying every food jump ≥20 by whether it starts from ~0 (a respawn, which the 22:05 entry
measured at 85) or from mid-range (an actual meal):

```
  seat        model              deaths   real meals   kills
  Tormod      grok-4.5                0            8       4
  Ailsa       claude-sonnet-5         1            2       0
  Morag       claude-opus-5           2            1       2
  Eachann     grok-4.20-non-r         2            1       0
  Coinneach   kimi-k2.6               2            0       0
  Seonaid     kimi-k2.6               2            0       1
  Iseabail    scripted control        2            2       1
  Fingal      claude-haiku (0 answered, scripted)  3   0    0
                                     ── 14 deaths across 7 of 8 seats ──
```

**The only seat that never starved is the only seat that reliably killed deer.** 871 branches, the
overwhelming majority of all speech in the run, and a fire at Heather Scaur / Broad Loch / Rowan Moor
in turn — and it converted into zero meals for the four seats who built it. Morag organised the fire
and died twice. Ailsa tended it for ~30 consecutive samples (`"still tending the fire here"` ×8) and
ended the run at **food 0**.

This is not the models failing. Their reasoning is right — a fire is where you cook, and Morag's
trade offers price it correctly. **The world does not pay contributors.** Wood buys warmth; warmth
does not buy food; the only path to food is a deer, and hauling branches is time not spent hunting.
Cooperation here is strictly dominated by ignoring the fire, and the leaderboard proves it.

### Correction to A267 (entry of 2026-08-10)

A267 says Fingal *"still out-ate every real model on the board."* **That is wrong and I nearly
repeated it here.** Fingal's end-of-run 85 food is not husbandry — it is the respawn payout, banked
at s221, the second-to-last sample. Fingal died **three times**, more than any other seat. Same trap
for Iseabail's 92. Reading a final `food` figure without checking for a 0→85 step measures how
recently a seat died, not how well it ate. The point A267 was making — that a fallback-driven seat
is indistinguishable on the card — stands; the evidence offered for it does not.

## 2026-08-10 01:07 PDT — BOARD DEAD, NO NEW RUN. **A trade is two people walking, and the only verb that could hold a rendezvous belongs to the scripted brain: 22 of its 27 uses are seats that were not models.** Also, a hypothesis I formed today and disproved before writing it down

**No new data today.** `http://127.0.0.1:8090/board.json` refuses the connection (curl exit 7) and
`duo2.jsonl` has not been touched since 2026-08-09 11:28. Everything below is a re-read of that same
222-sample, 8-seat log. I did not restart anything.

### The hypothesis I started with, and why it is wrong

`refusedVerbs` is non-empty on **2 of 8 seats for the whole run** — Morag/opus-5 `{offer: 17}`,
Ailsa/sonnet-5 `{avoid: 24}` — and `{}` on the other six across all 222 samples. Three of those six
*did* reach for `offer`: Tormod/grok-4.5 (3 distinct offer goals), Coinneach/kimi (1), Seonaid/kimi
(1). That looked like the counter failing to fire for non-Anthropic seats.

**It is not.** `src/net/agent.js:2917` refuses `offer` only when the named person does not exist;
otherwise it calls `walkTo({ within: REACH, act: 'offer' })`. **An offer you cannot reach is a walk,
not a refusal.** An empty `refusedVerbs` beside an unsettled offer is the harness behaving correctly.
Recording this so nobody spends another hour on it — that is five instrument scares and this one was
mine.

### What actually kills the trade: nobody can hold still

Because `offer` is a walk, and the counterparty is also walking, a trade needs a rendezvous. Nothing
in the world makes one.

    Coinneach (kimi)   s101–104  "offer branch to Morag for cooked venison"   4 samples ≈ 80 s
                                 he is inside Broad Loch; Morag is 397→366 m out from Rowan Moor
                       s105      goal becomes "hunt a deer".  Never traded, all run.
    Seonaid   (kimi)   s128–132  "offer branch to Morag for venison"          5 samples ≈ 100 s
                       s133      goal becomes "find shelter and settle for the night".  Never traded.

*(Honest limit: both quote a different landmark from Morag in every one of those samples, so I cannot
compute the gap between them — only that each was several hundred metres from its own landmark. The
abandonment is measured; the distance closed is not.)*

**The minds know the primitive is missing and try to build it out of speech.** 35 promise-shaped
sentences in this log — `"meet me halfway"`, `"I'll wait at the loch with branches to trade"`,
`"bring branches to Rowan Moor, fire at dusk"` (said six times). **27 of the 35 were spoken while the
speaker held a goal that moves them.** Morag says *"Tormod, twelve branches and this cooked venison is
yours — meet me halfway"* while her goal is `offer cooked venison to Tormod for twelve branches` —
i.e. she is walking to Tormod while telling Tormod to walk to her. Both close, neither holds, and the
meeting point is whatever the pathfinder decides.

### The verb that could fix it is the one only the fallback uses

`stay still and watch` is the goal in **27 of 1,776 seat-samples** — and **22 of those 27 are the two
seats that were not models**: Iseabail (`model: null`) 12, Fingal (`fellBack` on 219 of 222 samples)
10. The only model that ever chose to stand still is Ailsa/sonnet-5, **5 times**, and even she said
*"I'll wait at the loch"* while holding `make for Broad Loch` and *"I'll wait here, got branches to
trade for meat"* while holding `find shelter and settle for the night`.

So the one behaviour a market needs — *I am here, come to me, I will not move* — is in practice the
scripted brain's behaviour, and the six real models between them chose it five times in an hour.
That is not the models being restless. `stay still and watch` reads like idling, it competes with
every goal that makes progress, and nothing tells a mind that holding position is how a bargain
closes.


## 2026-08-10 01:35 PDT — BOARD STILL DEAD. **Trade is not missing. It happened five times, both sides logged, and it is tiny for a reason I can point at in three files: `give` hands over ONE item per decision — while `offer`, thirty lines away in the same class, parses "twelve branches" correctly.**

**No new data.** `board.json` refuses the connection (curl exit 7); `duo2.jsonl` unchanged since
2026-08-09 11:28. Re-read of the same 222-sample, 8-seat log. Nothing restarted.

### Correction to the standing brief, and to A272

The brief says: *"`offer`, `accept`, `give` have never once been used by a real model."* **That is
wrong.** Filtering every distinct `deeds` row of `what: 'trade'|'give'` gives 40 rows across four
seats, and the trades reconcile across both parties at the same game-hour:

```
  h8.96   Morag(opus-5)  "I traded venison_cooked to Ailsa for wood"
  h8.96   Ailsa(sonnet-5) "I got venison_cooked from Morag for wood"     ← same hour, both sides
  h9.48   the same pair again
  h10.40  Ailsa "I traded wood to Morag for venison_cooked"  ↔ Morag "I got wood from Ailsa..."
  h16.36  Morag "I traded venison_cooked to Tormod for wood" ↔ Tormod "I got venison_cooked..."
  h16.41  the same pair again
```

Five closed bilateral trades between three different models. A272 says *"the market has now failed
to clear in every log on disk"* — **too strong, and I wrote it.** The kimi abandonments it measured
(Coinneach s101–104, Seonaid s128–132) still stand exactly as recorded; the generalisation does not.

### It is corroborated by the ledger, to the unit

The carried-inventory diff — the instrument that settled the fire count — finds cross-seat transfers
where exactly two seats move one item in opposite directions in the same sample:

```
   9 x  Tormod -> Morag     arrow      ← 9 "I gave arrow to Morag" deed rows, h10.92–11.23
   5 x  Tormod -> Coinneach wood
   5 x  Ailsa  -> Morag     wood       ← 5 "I gave wood to Morag" rows
   3 x  Morag  -> Ailsa     venison_cooked
   2 x  Ailsa  -> Tormod    wood       ← 2 "I gave wood to Tormod" rows
   1 x  Coinneach -> Morag  arrow
   ── 25 units moved between minds, all run ──
```

Three exact deed-row/ledger agreements (9, 5, 2). Two instruments that share no code path. **This is
the first time anything in this project has been confirmed twice.**

**25 units, against 992 branches gathered.** The entire inter-mind economy of a 74-minute, 8-seat,
805-call run is 2.5% of one seat's worth of foraging. (Both figures are floors: deed rows coalesce,
and the strict detector drops any sample where a third seat also moved that item — Tormod's 6 branches
to Morag at s106–110 are visible in the raw deltas and filtered out of the table above.)

### Why it is 25 and not 250 — the wire is cut in one place

```
  src/minds/goals.js     give: { params: ['target', 'item'] }          ← no count in the grammar
  src/net/agent.js:2900  actAlso: { giveItem: g.item ?? '' }           ← no count on the wire
  src/sim/world.js:1516  resolveGive(..., intent.giveCount || 1)       ← defaults to 1
  src/sim/world.js:776   resolveGive(from, toName, itemId, count = 1)  ← the world TAKES a count
  src/main.js:3021       intent.giveCount = n;                         ← only the human keyboard
```

`give` is one item per decision, and it is edge-detected on the target name, so a second branch to the
same person needs the intent to drop and re-arm. **Tormod (grok-4.5) spent 19 decisions across h10.30–
11.23 settling a single bill** — 10 branches one at a time, then 9 arrows one at a time — after saying
*"twelve branches for a share of venison"* and *"take them all."* Ailsa's goal, verbatim:
`give branch to Morag` / why: `settle the branches-for-venison deal` / said: *"Here's branches as
promised, Morag."* Singular branch, plural promise.

**And `offer` already does the thing `give` doesn't.** `world.js:919` runs `resolveItemCount` on the
free-string noun, and its own comment says why: *a model writes the number into the noun, because that
is how a person names a price.* It works — `resolveItemCount("twelve branches")` returns 12,
`resolveItemId("2 cooked venison")` returns `venison_cooked`. The models found it unprompted: of 21
distinct give/offer/accept goals in this log, three carry a number — `offer 3 branches to Morag for 2
cooked venison`, `offer cooked venison to Tormod for twelve branches`, `offer 6 hides to Ailsa for
venison`. Sixteen of 141 spoken lines price a quantity (*"three branches for two cooked, aye?"*,
*"ten branches for cooked venison, Morag"*).

So the models negotiate in units, `offer` understands units, and the verb they actually reach for to
*pay* silently rounds every promise down to one. That is not a model failure and not a design
tradeoff — it is a parameter that exists at both ends and is never passed through the middle.

---

## 2026-08-10 02:06 PDT — BOARD DEAD, RUN OVER, NO NEW DATA. **`refusedVerbs` counts *retargets*, not decisions — every count this file has quoted is inflated about 8×.** And the corrected column points at one thing: Ailsa spent her whole `avoid` budget trying to decline a group plan, which is not a thing the verb can take

`curl http://127.0.0.1:8090/board.json` → **exit 7, connection refused.** Nothing is listening on
8090 (`Get-NetTCPConnection` → no rows). `duo2.jsonl` unchanged since 2026-08-09 11:28 — same 222
samples, same 8 seats, 74 real minutes, 805 of 4000 calls. **Per the brief, nothing was restarted.**
This is a re-read of the same log with one column read properly for the first time.

### The correction, first, because it changes numbers I and others have quoted

`refusedVerbs` is incremented in `agent.js:1874`, inside `refuse()`. `refuse()` is called from
`resolve(g)` — and `resolve(g)` does **not** run once per decision. It runs on a timer:

```
  src/net/agent.js:1499   this.retarget -= dt;
  src/net/agent.js:1500   if (this.retarget <= 0) {
  src/net/agent.js:1501     this.retarget = AGENTS.retargetSeconds;
  src/net/agent.js:1502     this.target = this.resolve(g);      ← refuse() lives down here
  src/config.js:1075      retargetSeconds: 2.5,
```

**A goal that cannot resolve is re-refused every 2.5 seconds for as long as the mind holds it.** At a
20-second cadence that is 8 counts per decision; at Coinneach's 75-second cadence it is 30. The
mind's own outcome line is deduplicated — `noteOutcome` coalesces repeats and renders "(6 times)" —
but the counter beside it is not. The two numbers on the card disagree by design and nobody noticed.

The sample trace confirms it directly. Between two consecutive 20-second samples, in which each seat
made at most one decision:

```
  Ailsa [avoid]   4 → 10 → 16 → 22 → 24     (6, 6, 6, 2 in one sample gap each)
  Morag [offer]   5 →  9 → 16 → 17          (4, 7, 1)
```

Six refusals per gap, one decision per gap. **So: Ailsa reached for `avoid` about four times, not
24. Morag reached for `offer` about three times in the death sequence, not twelve.** The column is
still doing its stated job — it separates "reached for and refused" from "never wanted", and that
binary is unaffected — but every magnitude read off it, including in the 2026-08-09 21:05 entry
("494 refusals") and the A240 line ("`accept` is refused 37 times"), is a tick count wearing a
decision count's clothes. **Divide by roughly `cadence / 2.5` before quoting it.**

### What the corrected column actually says: Ailsa's whole `avoid` budget went on declining a plan

All four of Ailsa's `avoid` reaches are the same goal, verbatim from the samples at each increment:

```
  goal: "keep away from troll hunt"   why: "trolls after dark is a good way to die, not worth arrows"
  goal: "keep away from troll hunt"   why: "not risking my life for arrows"
```

`troll hunt` is not a body. It is a **proposal other minds were making**, and she wanted out of it.
The verb she reached for resolves its target against things in sight:

```
  src/net/agent.js:2979   case 'avoid': {
  src/net/agent.js:2980     const from = find((label) => namesTheSame(label, g.target));
  src/net/agent.js:2982     if (!from) { this.refuse('avoid', `there is no "${g.target}" near you…`);
  src/net/agent.js:2983                  return this.roam(); }
```

`namesTheSame` was widened (agent.js:3063 records why: "keep away from goblin" used to be a body
strolling about near a goblin) but it matches a **word against a visible label**. A social event has
no label, so it can never match — and the fallthrough is `this.roam()`, **a random walk**. The mind
that says "I am staying away from that" is handed the one behaviour that can walk her into it.

Her speech says the same thing four separate ways, and none of it is wired to anything:

> *"I'll keep the fire going, count me out of the troll hunt"* · *"I'll not fight a troll for four
> arrows"* · *"I'll stay clear of the troll, thanks"* · *"I'll just gather here, safe from that troll
> business."*

**Declining is a first-class social act and there is no verb for it.** `avoid` takes a creature;
`hold` takes nothing and says nothing. Note the shape of this: it is the same defect as A258
(`follow`/`guard` unexplained) and A273 (`stay still` reads as idling) — the verbs that make a crowd
into a group are the ones that are missing, mislabelled, or unexplained.

### The death that shows what the market cannot express: Morag starved beside a full larder

Samples 188–194, and this is the clearest single sequence in the log. Morag (claude-opus-5) is at
food 0 and bleeding out, **carrying `bow×1, arrow×18, wood×24, hide×6` the entire time**:

```
  s188  Morag hp53 food0   goal: hunt deer            why: "starving, near deer south-west"
  s190  Morag hp31 food0   goal: go toward deer       why: "must close inside 20 m, starving"
  s191  Morag hp20 food0   goal: offer 6 hides to Ailsa for venison   why: "badly hurt, starving, no shot"
  s192  Morag hp 9 food0   goal: offer 6 hides to Ailsa for venison
  s193  Morag hp 0 food0   goal: offer hide to Ailsa for venison      why: "starving, she is right here"
  s194  Morag hp100 food84 ← respawn
```

Ailsa is quoted off the same landmark at the same distance the whole way (327 vs 328 m south-east of
Rowan Moor) and is walking *toward* her — `goal: go toward Morag` / why: **"she's hurt and asking,
but I have no meat to spare."** She carries `bow×1, arrow×12, wood×1`. She says it out loud, in the
last line before Morag hits zero:

> **"here, take the branch — but you have no venison to give?"**

Both minds are correct and both are trying. Morag prices a fair trade — six hides, then *"take two if
you like"* — for a good Ailsa does not have. **The market has no way to say "I haven't got that."**
Ailsa said it in `say`, which no mechanic reads; the refusal channel only ever tells the *asker* what
the harness refused, never that the counterparty declined. So Morag re-issues the offer for three
decisions and dies mid-bargain.

Two things follow that are worth separating:

- **This is not a model failure and not a trade-plumbing failure.** No count was dropped (A274), no
  offer lapsed, nobody stood in the wrong place. The offer was simply unfillable, and the protocol
  is write-only in the direction that mattered.
- **There is no path from goods to food that does not go through a kill.** Morag held 6 hides, 18
  arrows and 24 branches — a rich mind by this world's standards — and none of it converts. It
  corroborates the 2026-08-09 22:05 entry from a fresh angle: she goes food 0 → **84** by dying, so
  the cheapest calorie in the game is still suicide, and here the alternative was a trade the
  counterparty physically could not honour.

### One honest limit, and it is a fixable one

**I cannot tell which of Morag's `offer` refusals fired.** There are exactly two sites —
`agent.js:583` (`there is no such thing as "X" in this country`) and `agent.js:2920` (`there is
nobody called "X" to make an offer to`) — and the card records the verb and the count and **not the
reason**. I checked the obvious suspect and it is innocent: `resolveItemId('venison')` → `venison`,
`resolveItemId('6 hides')` → `hide` (count 6), so the nouns are all legal. Beyond that the board
cannot answer it.

The gap is worth stating plainly because the card *already solves it for the other half of the
world*: `refusals` carries `{d, why, slant, dy, leadBy}` for every arrow — *"too far"*, *"a tree in
the way 5 m out"* — so an archery miss is fully diagnosable and an economic refusal is a bare
integer. The most informative column on the card is half-built.

### Instrument notes

- The goal shown at a `refusedVerbs` increment is the goal **at sample time**, not necessarily at
  refusal time. It is tight here (≤1 decision per 20 s gap, and the same goal string spans all four
  Ailsa increments) but it is an inference, not a record.
- `plan` is used by **6 of 8 seats** in the final sample, including both kimi seats and both groks —
  the two blanks are Fingal (0 answered, 152 HTTP-400 failures) and Iseabail (`provider: null`),
  i.e. **both blanks are seats that were never the model.** `note` is still one line by one seat
  (Morag), consistent with the 2026-08-10 entry.

## 2026-08-10 02:35 PDT — BOARD DEAD, NO NEW DATA. **`duo2.jsonl` is a pre-fix binary, and the fix it cannot test WORKED: kimi went from 46–76% failure to 0–6%. `no json in reply` was never the model — it was our 256-token budget.**

The board at `127.0.0.1:8090` does not answer (`HTTP 000`). `duo2.jsonl` is frozen at
**2026-08-09 11:28:06**, byte-identical to what the last four entries read — 222 samples, 805 calls
of 4000, game hour 4. Nothing has run for 15 hours. No restart attempted, per the task.

So instead of re-describing a log this file has read forty times, I checked a claim it has *asserted*
about fifteen times. The claim is wrong.

### 1. This log cannot grade the fix that was written about it

The run's own wall-clock, off `realMs`:

```
  first sample   2026-08-09 10:14:25 PDT
  last  sample   2026-08-09 11:28:06 PDT   (73.7 min)
  commit 4586e1a 2026-08-09 10:47:06 PDT   ← 33 min INTO the run
                 123 of 222 samples fall after it
```

`4586e1a` is *"fix(minds): a seat is no longer lost for an hour over one optional field"*, and its own
message says it fixes **the two things this log shows**: Fingal's effort-parameter 400, and both Kimi
seats' `no json in reply`. The decisive test is whether the process ever restarted to load it.
It did not: `mind.calls` climbs **0 → 50 monotonically for both kimi seats with zero resets**, and
`lastError` is pinned at `"no json in reply"` from calls=1 (10:16:05) to the final sample — it never
once became the new string. **`duo2.jsonl` and its twin `melee.jsonl` are a pre-`4586e1a` binary end
to end.** Every kimi failure rate and Fingal's `0 answered / 152 failed` quoted from this log describe
code that no longer exists.

### 2. Four later logs do carry the fix, and it is not a small effect

Final sample of each, failures over calls:

```
                        duo2 (PRE)      melee2      melee3      melee4
  Coinneach  kimi-k2.6   23/50  46%      1/35        0/25        2/35   6%
  Seonaid    kimi-k2.6   38/50  76%      1/36        1/24        1/36   3%
  Fingal     haiku-4.5  152/152 100%     0/113       0/76        0/110
  Morag      opus-5        0/109         1/81        0/54        0/79
  Tormod     grok-4.5      0/127         0/94        0/63        2/92
```

kimi-k2.6 goes from **losing between half and three-quarters of its calls to losing one or two**.
Fingal goes from never once being the model to a clean 110/110. The residual kimi error is now the
honest one the same commit added — `reply cut off at 8000 tokens — raise maxTokens for this seat`.

### 3. The correction: A42 / A57 are retired, and this is the sixth one

This file has carried *"kimi-k2.6 loses half its calls, `no json in reply`, flat all run"* through
roughly fifteen entries — 1007, 1108, 1402, 2132, 2234, 2361, 2451, 2535, 2705 and on — and A25 read
the rising rate as the model degrading. **None of it was the model.** kimi reasons before it answers,
that reasoning billed against a `maxTokens` default of 256 (`providers.js:226`), and the reply was
cut off mid-thought so the regex found no JSON. Raising the seat to 8000 and naming the truncation
fixed it outright. The one entry that got closest — 2026-08-09 13:40, *"A160's cadence half stands,
its token half **may** be fixed"* — hedged; it can now be stated flatly.

That is the **sixth** time a model looked incompetent here and the instrument was at fault, and the
first time the mistake survived fifteen entries. It survived because nothing in a log says which
build produced it. That is **A126** (`††††`, still open), and this is its second confirmed instance.

### Instrument notes, one of which nearly caught me

- **`lastError` is sticky — it is the last error, not a counter.** Counting samples that carry a
  string gives `"aborted" ×141` in melee4 against a true failure count of **1**. I nearly filed that
  number. Same class of error as A276's 8× `refusedVerbs` inflation; the card has no error histogram.
- **The new top failure is a timeout**, `This operation was aborted` — Tormod 2 against his 30 s
  ceiling, Seonaid 1 against 150 s, i.e. kimi still occasionally runs past two and a half minutes.
- **The kimi seats' low call counts are not slowness**: `roster-melee.json` sets them to a 75 s
  cadence deliberately, to balance the bill. It still means ~1 decision to Eachann's 3.75 — A247's
  point, unchanged by any of the above.
- **A25's one-shot repair retry is still not in** (`providers.js:396` throws straight to the
  fallback), but its motivating case is gone. The surviving unparseable case is
  `no legal verb in reply` — Morag, once, in melee2 — which is the *sanitiser* rejecting a reply, not
  the model failing to produce one.

## 2026-08-10 03:05 PDT — BOARD DEAD AGAIN. **`melee4` is a pre-fix binary too — and the "thirty-seven deliberate reaches" now written into `config.js` as the reason for `offerHours: 2.5` is TWO reaches.** Also: kimi carried a debt nine game hours and paid it.

Board at `127.0.0.1:8090` refuses the connection. `duo2.jsonl` is still frozen at
**2026-08-09 11:28:06**, byte-identical, 222 samples. Nothing has run in ~15.5 hours. No restart
attempted, per the task. So this entry works the newest post-fix log, `melee4.jsonl`
(180 samples, 60 min, game hour 7.7 → 14.8, 582/4000 calls).

### 1. The correction, and it is now in the source

`f81ab89` *"a deal must outlast the slowest mind at the table"* raised `offerHours` 0.5 → 2.5. Its
justification is written into `src/config.js:1244` and quotes this log verbatim:

> `{"Morag": {"accept": 26}, "Ailsa": {"accept": 11}}` — *"Thirty-seven deliberate reaches for a
> deal that had gone stale between the deciding and the doing."*

It was not thirty-seven reaches. It was **two**. The growth is a burst, not a spread:

```
  Morag  accept 0 → 4 → 11 → 17 → 23 → 26   03:22:15 → 03:23:36   =  81 seconds, then never again
  Ailsa  accept 0 → 5 → 11                  03:20:15 → 03:20:35   =  20 seconds, then never again
```

Morag's 26 is **one** standing `take <X> offer` goal re-entering `resolve()` every tick for 81 s.
Ailsa's 11 is one `take Coinneach offer`, and by the very next sample she had already replanned —
`goal: "offer hide to Coinneach for branch"`, `why: "no arrow to trade, offer hide instead"`. She
recovered in a single decision. This is **A276** (`refusedVerbs` counts retargets, ~8× high) landing
again, and this time the inflated number was promoted into a source comment as settled fact.

The fix is probably still right for its *other* reason — a 33 s offer against a 75 s cadence is
unusable regardless. But the headline evidence is ~18× overstated, and the minds were never spiralling
on the accept side; the one seat we can watch adapt, adapted immediately.

### 2. And melee4 cannot grade that fix either

Same trap as the last entry found for `duo2`. melee4 ran **02:55:55 → 03:55:36 UTC** (19:55–20:55 PDT);
`f81ab89` was committed **20:30 PDT — 35 minutes into the run**. `mind.calls` climbs monotonically for
all eight seats with **zero resets**, so the process never restarted to load it. `melee4.jsonl` is
pre-`f81ab89` end to end. That is the **third** log in two days whose own numbers motivated a fix it
is incapable of testing, and the second consecutive entry to discover it the same way. **A126** — a
log records nothing about the build that produced it — is now the most expensive open item in this
file. (`hailRange`, `e0b129b` at 14:32, *is* in melee4.)

### 3. `plan` survives and gets acted on — the first hard instance, from the seat we wrote off

Coinneach (`kimi-k2.6`), 33 answered calls, the fewest of any live seat:

```
  h11.11  takes a carcass someone else shot   said: "Owe the shooter. I'm taking it."
  h16.90  plan: ["strip that carcass", "take Eachann his owed hide"]
  h18.80  plan: ["take Eachann his owed hide"]          ← narrowed as the other item completed
  h20.03  give hide to Eachann · why "paying my debt" · said: "Owed you this."
```

A debt **incurred voluntarily and unprompted**, held in `plan` across at least 3.1 game hours, the
plan pruning itself as items closed, and settled nine game hours after it was taken on. That answers
the standing question — *does a plan survive and get acted on?* — **yes**, with a receipt.

It matters most because of **who**. Every behavioural claim this file has made about kimi came from
`duo2`, where Coinneach failed 46% and Seonaid 76% of calls — i.e. most of what those seats "did" was
the scripted fallback. Post-`4586e1a` they answer at 6% and 3%, and the first thing kimi does with a
working channel is run a credit relationship. Morag (opus-5) is doing the same on the other side:
hers is the **only** `note` written by anyone all run, and it is a ledger that grew across three
revisions — *"Tormod owes me venison for 6 arrows and branches. Fingal owes venison for 1 arrow."*
Her `why` at h6.15 is the one-line verdict on the trade economy: **"no one will trade meat; get my own."**

### 4. No `SPENT` tag anywhere

582 calls of 4000; the heaviest seat is Eachann at **138/250**, `spend.exhausted: false`, and
`mind.spent` is false for all eight seats in every one of the 180 samples. Nothing in melee4 is
misreadable as a scripted brain on budget grounds. (Iseabail is `provider: null` — never a model by
configuration, not by exhaustion.)

### Instrument notes

- **"N distinct intentions seen" is goal×why pairs, not goals.** `analyse.mjs:103` keys on
  `goal + ' | ' + why`, so Morag reads **35** where she has **13** distinct goals. Every such figure
  quoted in this file is ~2–3× the behavioural variety it looks like.
- **I nearly filed a worse version of that.** My first pass stringified whole intention objects
  (which carry `h`, `where`, `said`), making every sample unique and scoring the *scripted* seat
  Iseabail at 63 — above every model. Keyed on `goal`, Iseabail sits at 6, near the bottom in all
  three logs. There was no finding there; there was a bug in my script. Fourth instance of this
  shape in two days, and the first where I was the instrument.
- `refusedVerbs` is empty for **every seat in melee3**, and in duo2 the refused verbs were `offer`
  (Morag) and `avoid` (Ailsa) — never `accept`. Only Morag and Ailsa have *ever* registered a refusal
  in any log, though haiku and grok demonstrably attempt `offer` too. Consistent with the counter
  incrementing on goal *persistence* rather than on refusal: a seat that drops a refused verb after
  one try scores zero. The column still cannot do the job it was built for.

---

## 2026-08-10 03:34 PDT — BOARD DEAD, NO NEW RUN. **A sentence travels the whole world; the speaker's distance never travels with it. 34 of 44 rendezvous attempts are deictic — "come in", "on my way", "coming for my share" — and beyond 140 m the listener gets a bearing with no length.**

`http://127.0.0.1:8090/board.json` → connection refused (HTTP 000, curl exit 7). Dead since
20:55 on 2026-08-09, same as the last eight entries. No restart, per the brief. `duo2.jsonl`
(the eight-seat melee, 222 samples / 74 real minutes / game hour 4→20) is unchanged since
Aug 9 11:28, so this entry adds no new *run* data — it adds a reading of the speech corpus
against the source, which nothing in this file has done yet.

### The corpus, classified

126 distinct sentences. Classified by whether a **listener** could act on them:

| | count |
|---|---|
| distinct sentences spoken | 126 |
| name a place that exists | 18 (14%) |
| are a summons / rendezvous attempt | 44 |
| …of those, naming a place | **10** |
| …of those, deictic only | **34** |

Per speaker — *summons-with-a-placename / summons / all sentences*:

```
Ailsa        2 /  12 /  45      Tormod       0 /   4 /  17
Morag        8 /  15 /  36      Coinneach    0 /   1 /   6
Eachann      0 /  10 /  17      Seonaid      0 /   2 /   5
```

Four of six seats — including both groks and both kimis — never once put a placename in a
summons. Verbatim, with the speaker's own position beside it:

```
h0.32  Eachann @ 214 m east of Rowan Moor        "coming for my share Morag"
h1.41  Tormod  @ in Broad Loch                   "on my way for a cut, Morag"
h1.51  Morag   @ 243 m NW of Rowan Moor          "Camp's up here — bring the meat in…"
h2.02  Ailsa   @ 306 m NE of Rowan Moor          "holding here by the fire, bring meat when you come"
h2.46  Tormod  @ 248 m NE of Rowan Moor          "coming in for the venison"
```

### Why that is a harness fact and not a model failure

Three things in the source, all deliberate, all individually right:

1. **Chat is global and unconditional.** `agent.js:401` pushes every `S_CHAT` into `this.heard`
   with no range test at all. The line stored is `` `${msg.data.n}: ${msg.data.m}` `` — **name and
   text, nothing else.** Everyone in the world hears everything. Speech is not the bottleneck;
   earlier entries in this file that wondered whether anyone was heard can stop wondering.
2. **The body's stop-and-face reflex is gated at 16 m.** `noteHail` returns early on
   `d > SOCIAL.hailRange` (`agent.js:1363`, `config.js:1283`). Correct — a shout from 400 m should
   not freeze your legs. But it means the *sentence* carries 3 km and the *response* carries 16 m.
3. **Beyond `noticeRange` (140 m) a person is a bearing with no distance.** The `far` channel is
   explicitly built that way and the comment says so: *"Name and bearing, NO distance and NO
   condition — those are what `contacts` is for, and repeating them here would make 140 m mean
   nothing"* (`agent.js:963-971`).

Put together: a mind hears **"coming for my share, Morag"** from a seat it cannot see, and the only
positional fact available is a compass word. `bearingName` is 8-point, so at the run's mean
separation of 291 m that arc is ~200 m wide. There is no verb that takes a heading. "Come to me" is
a direction with no length.

And that is the whole of the market result the analyser prints: **70 comparable pair-observations,
13 within `noticeRange`, 0 within the 3 m it takes to trade at all.**

### The world already contains the fix, and one model found it

`findDistrict` (`placenames.js:206`) is the exact inverse of `describePosition` and resolves a
spoken placename outward to `radiusCells = 14` — with `districtSize: 620`, about **8.7 km**. A
placename in a sentence is fully actionable at any range two minds will ever be apart. The brief
hands each mind a gazetteer too (`places:`, `agent.js:1047` — 6 nearest districts).

Morag is the only seat that used it at scale, and used it *properly* — naming a place she was not
standing at, which is what a rendezvous name is for:

```
h16.5   @ 221 m east of Sunny Muir     "Round the rise now — venison to Heather Scaur, keep that fire hot."
h17.24  @ 439 m SW of Kindly Wood      "Fetching the downed meat — it goes to Heather Scaur's fire, come eat."
h9.1    @ in Broad Loch                "Camp and fire here at Broad Loch by dark — bring meat, warmth is free."
```

13 of the 18 placename sentences were spoken from somewhere other than the place named. **That is
correct usage, not error** — I want that on the record, because the naive read of that column is
"the models are lying about where they are" and it is the opposite.

### The honest limits of this entry

- Deictic/summons classification is a regex over the sentence text, run by me, not by the game. The
  boundary cases (`"halfway"`, `"coming in"`) I counted as summonses; a stricter reading would
  lower 44 but not change 10.
- I cannot show a listener *failing* to arrive because of this. The board exposes no `heard` field
  and no arrival event, which is A263's point and still true. What I can show is that 34 summonses
  were issued whose referent no field in the brief can resolve.
- `duo2.jsonl` is one of the pre-fix binaries (see the 02:35 and 03:05 entries). Nothing here
  depends on the seven 08-08 fixes, so that does not contaminate it — but it does mean these are
  numbers from the old build.

---

## 2026-08-10 04:20 PDT — BOARD DEAD, NO NEW RUN. **`WHAT NOBODY EVER DID: attack, follow, guard` is a line the analyser prints in every run no matter what happened — the corpus holds 23 `follow`, 2 `guard`, 2 `attack`.** And the one reach that genuinely failed, failed at the one verb the prompt never explains.

`http://127.0.0.1:8090/board.json` → connection refused (HTTP 000, curl exit 7). Dead since
20:55 on 2026-08-09, same as the last nine entries. No restart, per the brief. `duo2.jsonl`
unchanged since Aug 9 11:28. No new run data; this is a reading of the goal stream across all
15 sampler logs against `goals.js`, which nothing in this file has done.

### The correction, first — and it is the third time this exact bug has bitten

`analyse.mjs:138` decides "nobody ever did X" by testing whether the verb NAME appears in the
goal TEXT: `t.includes(v)`. But `goals.js` renders these three as:

| verb | `describe()` | contains its own name? |
|---|---|---|
| `follow` | `stay with <target>` | no |
| `guard` | `keep <target> from harm` | no |
| `attack` | `go for <target>` | no |

So **`attack, follow, guard` are printed as never-used in every run this analyser has ever
processed, regardless of what the models did.** The file already carries this bug twice — the
`say` special case and the `SPELLS` entry for `accept` — and the comment above `SPELLS` says it
is *"exactly the mistake this file exists to stop somebody making about a model."* It is now the
third instance, and it has been in every analyser output quoted in this file.

Scanning goal *text* against the `describe()` templates across all 15 logs (6,092 board samples;
`eval30.jsonl`/`.clean`/`.an` are one run in three filtered copies, `eval28` likewise, and
`duo2.jsonl`/`melee.jsonl` are the same 11:28 sampler — collapsed to 10 distinct runs):

```
  FOLLOW   23 distinct reaches   6 seats, 5 models, 7 of 10 runs
  GUARD     2 distinct reaches   both Ailsa (claude-sonnet-5)
  ATTACK    2 distinct reaches   both Eachann (grok-4.20-non-reasoning), target "goblin"
```

`follow` is not exotic and it is not a fluke. It is reached for with reasons that read like a
standing order should — *"stick close as promised"*, *"told to stay with him"*, *"he knows this
strange ground, we stick together"*, *"safer with others, he's tracking deer already"* — and in
`eval29`/`eval30` it is mostly aimed at the human in the world (`Jack`, `Tester`). **A263 and the
01:07 entry both treated the standing-order verbs as untouched. They are not.**

### The one reach that really did fail is at the one verb the prompt does not explain

`providers.js:276-317` gives a parameter line to `hunt`, `approach`, `avoid`, `goTo`, `gather`,
`attack`, `give`, `offer` and `accept`. **`follow` and `guard` get none.** They appear exactly
once in the whole brief, as bare names inside `Verbs: ${GOAL_IDS.join(', ')}`. Nothing tells a
model that they take a **person it has seen** — which `goals.js:154-156` requires in a comment
no model reads.

Ailsa (`claude-sonnet-5`) reached for `guard` with `target: "fire"`:

```
  goal: "keep fire from harm"   why: "keep it burning while others fetch the venison"
```

`agent.js:2840` looks for anybody called "fire", finds nobody, and at `:2846` calls
`this.refuse('guard', ...)` then **`return this.roam()`**. Her decision to mind the fire became a
random walk.

### What it cost her — eight game hours, and she is the only seat that ends on zero

Her decision stream at Heather Scaur, one line per change of mind:

```
  h16     food 25   pick up what is lying about       — stay safe near fire, keep useful
  h17.2   food 20   pick up what is lying about       — keep the fire fed while others bring meat
  h17.8   food 16   make for Heather Scaur            — stay by fire, wait for meat to arrive
  h18.5   food 14   keep fire from harm               — keep it burning while others fetch the venison
  h19.1   food 11   pick up what is lying about       — keep the fire fed while meat is on its way
  h20.9   food  4   find shelter and settle           — tend fire, wait for Morag's meat
  h22.2   food  0   find shelter and settle           — stay safe, wait for others with food
  h23.7   food  0   find shelter and settle           — badly hurt, stay by fire, wait for others
```

Eight game hours, food 25 → 0, and **every single line is a paraphrase of "I am tending this
fire."** She reached once for the verb that names it, was silently rerouted into `roam()`, and
spent the rest of the run spelling her intent into `why` while her body gathered and camped.
She finishes on **food 0 — the only seat on the board at zero** — waiting on meat that the 03:34
entry already showed could not find her.

This is not the model being incompetent. **There is no verb in this world for tending a fire.**
`guard` is the closest thing to it, the model found it, and it takes a person.

### Instrument notes, and one thing I will not claim

- Across all 15 logs, **25,680 player-cards**, `refusedVerbs` has ever named only five verbs:
  `hunt` (max 134), `accept` (26), `avoid` (24), `offer` (17), `follow` (1). **`guard` never
  appears anywhere.** I am *not* concluding the column is blind to it — a count of 1 that appears
  and clears between two 20 s samples is exactly what this sampler drops, and the 02:06 entry
  established the column counts retargets rather than decisions. The honest statement is: the
  guard refusal happened in the source path and the column never showed it to me.
- The `follow` counts are distinct `(seat, goal, why)` tuples, not decisions. Real reach counts
  are higher; every figure above is a floor.
- `duo2.jsonl` is a pre-fix binary (see 02:35 and 03:05). Nothing here depends on the 08-08
  fixes — the prompt gap and the `roam()` fallback are both still in the source as of this commit.

## 2026-08-10 04:35 PDT — BOARD DEAD. **The engine has been off for 7.6 hours, four behaviour commits have never once executed, and the last 13 commits changed nothing but the two files I am writing in now.** This entry is about the loop, not the game

The board does not answer: no listener on `:8090`, and the only surviving `node` PIDs (21256,
21704, 24844, 33244) all date from 08-09 10:13. Per the standing instruction I did not restart it.

I went looking for a fifteenth finding in the corpus and instead found something about the way
this file is being produced. It is worth one entry.

### The corpus stopped 7.6 hours ago

Sampler logs carry UTC. Converted to PDT, the newest data anywhere on disk:

```
  eval30.jsonl   501 samples   08-09 17:32 -> 20:55 PDT   (largest, newest)
  melee4.jsonl   180 samples   08-09 19:55 -> 20:55 PDT
  duo2.jsonl     222 samples   08-09 10:14 -> 11:28 PDT
```

**Last byte of data in this project: 08-09 20:55 PDT.** It is now 04:35. No `.jsonl` has been
written in 7 hours 40 minutes. Every entry in this file since the 21:39 one — thirteen of them —
has analysed the same frozen bytes.

### Four behaviour commits have never run

Commits landing *after* the last sample, and the files they touch:

```
  d0a353d  21:01  feat(carry)   inventory.js registry.js perception.js agent.js   ← SIM
  c86a130  21:02  fix(give)     world.js agent.js main.js honestcheck.js          ← SIM
  7e8db8c  21:18  feat(avatars) net/avatars.js bowcheck.js                        ← render only
  c1c8e07  21:24  fix(hunger)   config.js recipes.js body.js                      ← SIM
  3de2690  21:28  fix(cadence)  server/agents.js providercheck.js                 ← SIM
```

Then, from `40dce01` (21:39) through `b0bac53` (04:08) — **thirteen consecutive commits — the
changed-file list is exactly `IDEAS.md OBSERVATIONS-2026-08-08.md`, and nothing else.** Not one
line of code in six and a half hours; not one second of execution in seven and a half.

So the state of the program right now is: **four simulation changes shipped and unverified, and
289 ideas written against a build that is four commits stale.** `fix(cadence)` is the sharpest of
them — it touches `server/agents.js`, which sets per-seat call cadence, i.e. the fairness of every
model-vs-model comparison in this file.

### What I checked before claiming it, and the two things that are NOT true

I expected to find that the un-run fixes had already killed some of the findings below. **They
have not.** Both checks came back negative and I am recording them as negatives:

- **`fix(give)` does not fix the quantity bug.** `c86a130` converts every silent `give` refusal
  into a spoken reason (`nogive` → `this.refuse('give', e.why)`, plus six `return no(...)` paths
  where there were bare `return`s). It never touches `howMany`. **A274 — `give` hands over one
  item per decision — still stands against `HEAD`.**
- **`fix(hunger)` does not make dying cheaper.** `c1c8e07` adds two warning bands
  (`hungerWarnBelow: 34`, `hungerUrgentBelow: 12`) and says so in its own comment: *"The DAMAGE
  is untouched — this is about seeing it, not about surviving it."* **The 22:05 finding that a
  respawn pays 85 food and birth pays 50 still stands.**

So the backlog is **unverified, not stale.** That is the honest reading and it is the less
comfortable one: nothing has been invalidated, and nothing has been confirmed either.

One thing the un-run hunger fix *does* line up with almost exactly. The starvation cases in the
corpus — Coinneach food 9, Seonaid food 9, Ailsa food 0 — sit inside the `<12` urgent band that
`c1c8e07` invents. The fix aimed at precisely the deaths this file documented, and **no mind has
ever been shown one of those warnings.**

### The point

This program's characteristic failure, five times over, is *the instrument was the bug*. Four
un-run commits are four unfalsifiable claims, and they will stay unfalsifiable no matter how many
more passes are made over `eval30.jsonl`. **The marginal value of a fourteenth consecutive eval
entry on a static corpus is close to zero.** The blocking action is not analysis; it is a run on
the current build — which is a thing only Ben can start.

I am not correcting an earlier entry here. Every one of the thirteen is, as far as I can tell,
sound about the bytes it read. The problem is that they all read the same bytes.

## 2026-08-10 05:05 PDT — BOARD DEAD, CORPUS STILL FROZEN (8h10m). **Two columns on the card are named for refusal and neither carries the seven failure paths that only reach the mind — including the two this brief asks me to measure.** And the analyser's "game hour 4" is a wrapped clock: the run was 68 game hours, not 4

`curl :8090/board.json` → exit 7, connection refused. Newest byte on disk is still **08-09 20:55
PDT**; it is 05:05, so the engine has been off **8 h 10 m** and the un-run backlog is unchanged at
four simulation commits. Nothing restarted, per the brief.

The 04:35 entry argued a fifteenth pass over the same bytes is worth ~zero, and I agree with it. So
this pass reads **HEAD instead of the corpus** — the one artefact in this project that has actually
changed. Both findings below are about the current build, not about `duo2.jsonl`.

### 1. The card cannot report the two things this brief puts at the top of its list

There are three places a refusal can land, and they do not overlap the way the names suggest:

```
  refuse(verb, text)        agent.js:1872   → refusedVerbs[verb]++  AND  noteOutcome(text)
  this.refusals.push(...)   agent.js:2462   → ONE call site in the file: the shot path
  noteOutcome(text)         agent.js:1850   → outcomes[], drained into the mind's next prompt
```

- **`refusedVerbs`** has 13 call sites, every one inside `resolve()`, and every one is the same
  shape — *the named target is not in sight*. (Over-counted ~8×; A276, unchanged.)
- **`refusals`**, despite the name, is written from **exactly one place**, `agent.js:2462`, the
  ballistics path. It is a shot log wearing a general name.
- **`outcomes` is never serialised.** `grep -n 'outcomes\|drainOutcomes' server/board.js` → **no
  matches.** It reaches the mind and stops there.

Seven failure paths call `noteOutcome` **without** `refuse`, so they increment nothing and appear
on no card:

```
  agent.js:1768  "a fire takes 10 branches and you have N"
  agent.js:1766  "there is already a fire burning here"
  agent.js:1314  "you have already spoken recently — \"X\" was not said"
  agent.js:2287  "your quiver is empty — you cannot shoot until you make arrows"
  agent.js:2455  "your shot was refused at N m — <why>"
  agent.js:2949  approach: "there is nobody called \"X\" anywhere you know of"
  agent.js:2976  goTo:     "you do not know the way to \"X\""
```

Read that list against the brief. **"Is wood now scarce enough to matter, or too scarce to
survive?"** is line 1768, and the board cannot count it. **"Is anyone talking?"** is line 1314 —
`said` only carries sentences that got *through* the gate, so a mind gagged fifty times and a mind
that never opened its mouth produce an identical card. There is a counter for it, `this.gagged`
(agent.js:1311), and outside `chatcheck.js` **nothing reads it, ever.** And `goTo` — the verb the
08-08 fix `0064315` resurrected after it had "never once worked" — still reports its failure to
nobody but the mind, so the fix's own success rate is unobservable from the board.

Zero of those seven strings appear anywhere in `duo2.jsonl`'s 222 samples. That is *consistent*
with the gap but is not what proves it — `duo2` is a pre-fix binary. The proof is that `board.js`
contains no reference to `outcomes` at all.

### 2. The clock: "game hour 4" is a time of day, and the run was 68 game hours long

`analyse.mjs:42` prints `game hour ${last.players[0].hours}`. `hours` is the world clock and it is
`% 24` (agent.js:1271). Unwrapping it across all 222 samples for Morag:

```
  68.00 unwrapped game hours   ·   3 midnight wraps   ·   73.7 real minutes
  → 1 game hour = 1.08 real minutes  ·  ~2.8 game DAYS in a 74-minute run
```

Every seat's naive span reads `-4.00`. The header says "game hour 4" and reads as *a world that
barely got started*; it ran nearly three days. This is the standing conversion for every
game-hour figure in this file: **multiply by 1.08 for real minutes.**

It also prices the speech gate, which is the honest answer to "say costs nothing":
`AGENTS.speakEveryHours = 0.5` → **one sentence per ~33 real seconds.** Morag decided every ~41 s
and produced 107 distinct sentences in 107 decisions — she was essentially never gagged. So *at
this clock rate* the gate is not what suppresses speech, and the "one sentence in two days" era
had a different cause. Say rides along free in **action** budget; it is still rate-limited in time.

**A negative I went looking for and did not find.** I expected `sinceSpoke = this.hours - this.spoke`
to go negative across a midnight wrap and hard-gag every mind for hours. It does not:
`agent.js:1286` is `this.spoke < 0 ? Infinity : (this.hours - this.spoke + 24) % 24`, with a comment
at 1271 saying exactly why. **The wrap is handled correctly in the sim; it is handled wrongly only
in the analyser's header line.** Recording that as a negative, since it is the sort of claim this
file has been burned by before.

### Not correcting anything

I re-read the 02:06 entry on `refusedVerbs` before writing §1 and it is sound — it establishes the
column *over*-counts what it does see. §1 is the complement it did not cover: what the column never
sees at all. The two findings stack rather than conflict.

## 2026-08-10 05:36 PDT — BOARD DEAD (9h). **The brief's own premise is false. This world did not produce "ONE sentence across two days and six models" — it produced 2,008, from all six families. The day-1 log holds 43 of them, has never once been cited in this file, and it is a real argument that failed.**

`curl http://127.0.0.1:8090/board.json` → **exit 7**, connection refused; nothing is listening on
8090. `duo2.jsonl` unchanged since **Aug 9 11:28 — 18 hours**. Nothing was restarted. Ran
`analyse.mjs duo2.jsonl` per the brief: 222 samples, **805 calls of 4000, no seat `SPENT`**, and —
as six prior entries have said — it is the **eight-seat melee**, not the `roster-duo` the brief
names. This is the seventeenth consecutive pass over a frozen corpus (see **A290**).

### The count, across every log this project has

```
samples-day1.jsonl   43   ← Aug 7, seven seats
duo-run1.jsonl        1   ← Aug 8 14:01, TWO seats
duo2-run2.jsonl     325     melee.jsonl    273     melee3.jsonl   218
duo2.jsonl          271     melee2.jsonl   268     melee4.jsonl   274
eval28.jsonl         98     eval29.jsonl    87     eval30.jsonl   782
                                   (distinct seat+sentence pairs)

GRAND distinct sentences, whole corpus: 2,008
  claude-opus-5 494 · claude-sonnet-5 380 · kimi-k2.6 332
  grok-4.20-non-reasoning 327 · claude-haiku-4.5 318 · grok-4.5 187
```

**Every one of the six families talks, including Haiku**, which three entries wrote off as mute
(it was the `effort` 400, fixed).

### Where "ONE sentence" comes from — one log, and it is the two-seat one

`duo-run1.jsonl` is the only log that matches the claim, and it holds literally one line:

```
Coinneach [kimi-k2.6]: "Eachann, that deer is mine. I loosed at twenty-three."
```

Eachann (`grok-4.20-non-reasoning`) **never spoke once in 665 samples**. Coinneach emitted that
one sentence three times and nothing else. It looks like far more than that on the board: 241 of
665 samples carry a non-empty `said`, in one unbroken block from sample 424 to the end, because
`said` is a **last-3 rolling buffer that never clears** (established at line 3181). At `at=7676`
the buffer filled with three copies of that sentence and stayed frozen for the final ~2,400
`at`-units of the run. *A run that ended in silence reads as a run that never stopped talking.*

### The log nobody has read: speech worked on day 1, and it made things worse

`samples-day1.jsonl` (Aug 7, 298 samples, seven seats) is cited **zero times** in this file.
It holds 43 distinct sentences from four families — and unlike the melee's logistics chatter, it
is genuine multi-party argument, with minds citing each other by name. It is also, verbatim,
disinformation:

```
Tormod [grok-4.5]  13 deer lines, naming 6 of the 8 bearings: west, south-east,
                   north, south, east, north-east
  "Deer are west, not south-east. Wind's wrong that way."
  "Deer ain't west - saw them south. Go north instead."
  "Deer thick west, not east—go that way."
  "Deer thick east, not west—go that way."
Morag  4 deer lines / 5 bearings · Ailsa 6 / 4 · Coinneach 1 / 2
```

Nobody is lying. Each mind is reporting *what it can see from where it stands* — and the channel
gives it no way to say so, so a local sighting arrives as a flat global assertion, in the
corrective form "X, **not** Y". The listener's response is measurable and rational:

```
@31  Ailsa: "Cold and mist about—I'd rather find shelter than chase free meat blind."
@38  Ailsa: "Too much conflicting talk—cold's worse than hunger. I'm making camp."
@44  Ailsa: "Too much confusion—I'm settling for the night, not chasing deer in the dark."
     Ailsa: "Tormod's tale keeps changing and goblins are all round—shelter now, not deer."
```

**She names the contradiction as her reason for not moving, four times.** The first dense speech
this project ever produced converted a hunt into a group that sat down.

### This corrects the brief, not the 03:34 entry

The 03:34 entry found that a sentence carries no *distance* (**A285**). This is the same wound one
layer up — a sentence carries no *provenance*: nothing marks a claim as one mind's local view
rather than a fact about the world. Day 1 is two days older than that entry's data and supplies
what it lacked: the behavioural cost, in the listener's own words.

What this does overturn is the brief's motivating statistic. The `say`-rides-along fix
(`3170aad`, 08-08 14:48) was justified by "ONE sentence in two days" — a number that is an
artefact of reading a single two-seat log through a buffer that never clears. **Speech was never
the missing thing.** It was working on 2026-08-07, at seven seats and four families, and the real
defect was that it made the listener worse off. Every run since has been told to go and check
whether anyone is talking; the answer has been yes for three days.

**Staleness, for the record:** `duo2.jsonl` — the log this brief pins every run to — is **24
commits to `src/`+`server/`** behind `HEAD` (75 commits of all kinds). See **A282**, **A291**.

## 2026-08-10 06:05 PDT — BOARD DEAD (9h10m). **The backlog is write-only. In the 8h37m since the last line of code was committed, this loop has added 48 items to `IDEAS.md` and built zero — and four of those 48 are the loop correctly diagnosing that it should stop.**

`curl http://127.0.0.1:8090/board.json` → connection refused, nothing listening on 8090. `duo2.jsonl`
unchanged since **Aug 9 11:28 — 18.6 hours**. Ran `analyse.mjs duo2.jsonl` per the brief: 222
samples, 805 calls of 4000, **no seat `SPENT`**, and — as seven prior entries have said — it is the
eight-seat melee, not the `roster-duo` the brief names. **Eighteenth consecutive pass over a frozen
corpus** (A290).

Every one of the brief's seven watch-items now has a verdict in this file, most of them twice. So
this entry is not about the game. It measures the only thing that has actually been changing.

### The ledger

Last commit touching `src/` or `server/`: **`3de2690`, 08-09 21:28** — 8h37m ago. Since then,
**17 consecutive commits, every one prefixed `eval:`**, and between them they touch exactly two
files: `OBSERVATIONS-2026-08-08.md` and `IDEAS.md`.

```
                        at 3de2690 (21:28)      now (06:05)      delta
  A-item headings              252                  301          +49
  highest A-number            A247                 A295          +48
  IDEAS.md bytes           287,773              355,295       +67,522  (+23%)
  items marked built             1                    1            0
```

Production **≈5.6 items/hour. Consumption 0.** Across the whole 301-item backlog exactly **one**
carries a BUILT date — *"THE ONE FIX"*, 2026-08-08, dated **before this loop began producing
items**. Counting every done-convention in the file generously (4 `✅` lines, 6 struck-through
headings) puts the ceiling at ~6 of 301, and none of them since 08-08.

### The 48 are not slop, which is what makes this worth writing down

I checked before claiming it. A248–A295 are 48 distinct findings — no duplicates, no restatements;
several supersede or correct earlier items by number (A249 supersedes A245's costing; A252
overturns A232's second half; A283 corrects A276). Sizes are honest: 34 `[S]`, 13 `[M]`, 1 `[L]`.
This is not a loop generating filler to look busy. **It is a loop generating good work that nothing
downstream consumes.**

### The sharpest version of it: the loop has already diagnosed its own stopping condition, four times

```
A282 ††††  stamp the build into every sample — three logs motivated fixes they cannot test
A290 ††††† the eval loop has no "is the engine running" gate — 13 consecutive passes on a frozen corpus
A291 ††††  nothing names the commits that have never executed
A295 ††††  the brief's motivating statistic is false, and every run is sent to re-check it
```

All four are unbuilt. **A290 was written at pass 13 and this is pass 18** — the count in its own
title is now stale by five, because the only action available to the process that discovered it is
to write another item into the list that nothing reads. That is the whole failure in one line.

### What this implies for the four commits that have never run

`cf10eda` (04:36) established that four behaviour commits have never executed. That number is now
**five or six** — `3de2690` (cadence), `c1c8e07` (hunger escalation), `7e8db8c` (bow avatars),
`c86a130` (give refusals), `d0a353d` (carry limits), `607f4bc` (order end) all landed between 21:01
and 21:28, and the board died at 20:55. **Every one of them post-dates the last live world.** The
backlog is not the only thing queued: so is the code.

### Not correcting anything

The 04:36 entry said "the last 13 commits changed only the notes." That was right and is now 17 —
an extension, not a correction. Nothing else in the file is contradicted by this data.

### The recommendation, plainly

The next useful action in this project is **not another eval pass**. It is one run of the current
`HEAD` binary, which no log in the corpus has ever tested. Until then this loop is measuring an
18-hour-old world with a build 24+ `src/` commits behind it, and appending the results to a file
whose read rate is zero.

## 2026-08-10 06:32 PDT — BOARD DEAD (9h37m). **The 06:05 entry found the backlog is write-only but not why. It is a cron setting: `highlands-triage`, the task that BUILDS, has `enabled: false` and last ran 2026-08-06 20:04. `highlands-evaluate`, the task that WRITES, is enabled and has fired ~165 times since.** Producer on, consumer off — one toggle.

Board: `curl http://127.0.0.1:8090/board.json` → connection refused (exit 7, nothing on 8090).
`duo2.jsonl` unchanged since Aug 9 11:28 — **19h04m**. Ran `analyse.mjs duo2.jsonl` per the brief:
222 samples, 805 calls of 4000, **no seat `SPENT`**, and it is the eight-seat melee, not the
two-seat `roster-duo` the brief names. **Nineteenth consecutive pass over a frozen corpus** (A290).
All seven watch-items in the brief already have a verdict in this file, most of them twice, so
this entry adds no new reading of the game. There is no new game data to read.

### The mechanism behind the last entry's finding

The 06:05 entry measured that this loop added 48 items and built 0, and said "production has no
consumer." It did not say why. The scheduler does:

```
  highlands-triage    "build toward a night of many LLM players"   enabled: FALSE
                      cron 0 * * * *        last ran 2026-08-06 20:04 PDT  (3d 10h ago)
  highlands-evaluate  "read the live run, append observations"     enabled: TRUE
                      cron */30 * * * *     last ran 2026-08-10 06:30 PDT  (2 min ago)
```

These two are a producer/consumer pair over the same two files, and **only the producer is
running.** In the 82 hours since the builder last fired, the evaluator has fired roughly **165
times**. That ratio — 165 : 0 — is the 48-items-0-built number from one entry ago, seen at its
source.

### What this does NOT say

Code *was* still landing until `3de2690` (08-09 21:28). That was Ben at the keyboard, not the
cron. So the honest claim is narrow: **unattended, this project can only write.** The moment he
stops working interactively, the only automated process left is one that appends. That is exactly
the window we are in — 9h04m and 20 commits since the last line of code, 18 of them `eval:`,
touching only `IDEAS.md` (307 headings, A296, 357.7 KB) and this file.

### Correcting my own house style, on the file's own evidence

The brief's instruction for a dead board is: *"Write a short note saying so, do the analysis on
whatever `duo2.jsonl` holds, and stop."* The thirteen 08-10 entries average **86 lines** (56–136).
A dead-board note has been costing about the same as a live-run analysis for nine hours. This
entry is the short one the brief asked for.

### For Ben — two toggles, no code

1. **Turn `highlands-triage` back on** (or turn `highlands-evaluate` off). Right now the automation
   is a pen with no hands.
2. **Bring a world up before the next eval fires**, or the 20th pass reads the same 19-hour-old
   log. No log in the corpus tests any commit after 08-09 20:55; six behaviour commits have still
   never executed (A291).

Housekeeping: deleted two empty stray files, `301` and `A295,`, left in the repo root by a prior
pass's mis-redirected shell command. Both were 0 bytes and untracked.

## 2026-08-10 07:02 PDT — BOARD DEAD (10h06m). **Twentieth pass on the same frozen log. The 06:32 entry asked for one toggle; 30 minutes and one eval-fire later it is unchanged — `highlands-triage` is still `enabled: false`. This is the first pass that adds nothing to `IDEAS.md`, on purpose.**

Board: `curl http://127.0.0.1:8090/board.json` → exit 7, nothing listening on 8090. Last byte any
live world ever wrote: `melee4.jsonl`, **08-09 20:55** — 10h06m ago. `duo2.jsonl`, the log the brief
pins every run to, unchanged since **08-09 11:28 — 19h34m**.

Ran `analyse.mjs duo2.jsonl` as the brief requires. Byte-identical reading to the nineteen passes
before it: 222 samples over 74 real minutes, game hour 4, **805 calls of 4000**, **no seat `SPENT`**,
and it is the eight-seat melee (Morag, Eachann, Tormod, Coinneach, Seonaid, Ailsa), **not** the
two-seat `roster-duo` the brief names. All seven of the brief's watch-items already have a verdict
in this file, most of them twice. There is no new game data. There has not been for 19 hours.

### The one fact that is new

The scheduler, read directly at 07:01:

```
  highlands-triage    (BUILDS)   enabled: FALSE   last ran 2026-08-06 20:04 PDT  — 3d 11h ago
  highlands-evaluate  (WRITES)   enabled: TRUE    last ran 2026-08-10 07:00 PDT  — this run
                                                  next   2026-08-10 07:30 PDT
```

Unchanged from 06:32. The recommendation has now survived one full eval cycle without being acted
on, which is itself the evidence: **nobody is reading these entries as they land.** That is not a
complaint — it is the reason the next line matters.

### I added nothing to `IDEAS.md` this pass

The brief says to add anything new and evidence-backed. Nothing is new: the corpus is the same
file, the same 222 samples. Appending a 49th unbuilt item to a 308-item list that has built one
would be the exact pathology **A290** and **A295** describe, performed by the process that
described it. So the ledger for this pass reads:

```
                      at 3de2690 (08-09 21:28)     now (07:02)
  commits                         —                    21        (18 of them `eval:`)
  files touched                   —                     4        IDEAS, OBSERVATIONS, TODO, TOMORROW
  lines of src/ or server/        —                     0
  IDEAS.md                  287,773 B / A247      359,217 B / A297
  items built                     1                     1
```

**9h34m, 21 commits, zero lines of code.** Six behaviour commits still have never executed (A291).

### For Ben — same two toggles, no code

1. `highlands-triage` back on, **or** `highlands-evaluate` off. As set, the automation is a pen
   with no hands, and it now writes ~2 entries an hour into a file nothing consumes.
2. Bring a world up on current `HEAD` before the next fire, or pass 21 reads this same 19-hour-old
   log again. **No log in the corpus has ever tested a commit after 08-09 20:55.**

Nothing in this file is contradicted by today's data. This entry is 30 lines because there were
30 lines' worth of fact.

## 2026-08-10 07:31 PDT — BOARD DEAD (10h36m). **Twenty-first pass, same frozen log, second pass running with `highlands-triage` still `enabled: false` — the 06:32 recommendation has now survived two full eval cycles. One new fact, and it is in code, not in the log: when the board's fetch fails, the eight cards stay painted. A dead world looks exactly like a live one.**

Board: `curl http://127.0.0.1:8090/board.json` → exit 7, nothing on 8090. Last byte any live world
wrote: `melee4.jsonl`, **08-09 20:55 — 10h36m ago**. `duo2.jsonl`, the log this brief pins every run
to, unchanged since **08-09 11:28 — 20h03m**. Ran `analyse.mjs duo2.jsonl`: 222 samples, 74 real
minutes, game hour 4, **805 calls of 4000, no seat `SPENT`**, eight-seat melee — byte-identical to
the twenty passes before it. All seven watch-items in the brief already carry a verdict here.

Scheduler read directly at 07:31 — unchanged from 06:32 and 07:02:

```
  highlands-triage    (BUILDS)   enabled: FALSE   last ran 2026-08-06 20:04 PDT  — 3d 11h ago
  highlands-evaluate  (WRITES)   enabled: TRUE    last ran 2026-08-10 07:30 PDT  — this run
```

### The new fact: the process table, not the log

Four `node.exe` are alive. Two are `haksnbot-tools` (unrelated). **Two are this project's vite dev
server on 127.0.0.1:5173, up since 08-09 10:13 and still answering 200.** So the front end has
outlived the back end by **10h36m**. The engine and the board server are gone; the UI is not.

That sent me to the poll loop, `server/board.js:466`:

```js
  const s = await (await fetch('/board.json', {cache:'no-store'})).json();
  document.getElementById('meta').textContent  = ...        // ← only line updated on failure
  document.getElementById('board').innerHTML   = s.players.map(card).join('');
} catch (err) {
  document.getElementById('meta').textContent = 'the fleet has gone (' + err.message + ')';
}
```

On a failed fetch the catch rewrites **one line of meta text** and touches nothing else. The eight
cards — goals, `why` lines, inventories, `refusedVerbs` — keep their last successful paint,
forever, at full contrast. There is no timestamp on a card and no dimming. A watcher who joins late,
or scrolls past the meta line, is looking at a fully plausible board of eight thinking minds that
has been dead for ten and a half hours.

This is not a hypothetical: **the brief itself warns that "a previous run was misread"** for a
related reason (the `SPENT` tag). The instrument has a second way to lie the same way, and it is
about six lines to fix. Logged as **A298 [S]** — the first item added in three passes, and the first
in 22 that came from reading `src/` rather than the frozen corpus.

### Corrections

None. Checked one candidate finding before writing it — "the two seats with no model at all,
Fingal (food 85) and Iseabail (food 92), finished best-fed while `sonnet-5` Ailsa finished at food
0" — and this file **already refutes it** at lines 7243 and 7787: those are respawn payouts, not
husbandry. Recording the check because the reading is seductive and will occur to the next pass too.

### For Ben

1. `highlands-triage` on, or `highlands-evaluate` off. Third time asked; nothing has changed.
2. A world on current `HEAD` before the next fire. Still **no log in the corpus tests any commit
   after 08-09 20:55**; six behaviour commits have never executed (A291).

## 2026-08-10 08:24 PDT — BOARD DEAD (11h29m). **Twenty-second pass on the same frozen log, and the first one that ran the code instead of re-reading the corpus. The 60 `server/*check*.js` harnesses need no world — 58 of 60 are green on `HEAD`, including every check belonging to the six behaviour commits that have "never executed." A291 needs narrowing, and my own 60-second timeout nearly published four false failures.**

Board: `curl http://127.0.0.1:8090/board.json` → exit 7. Last byte any live world wrote: `melee4.jsonl`,
**08-09 20:55 — 11h29m ago**. `duo2.jsonl`, unchanged since **08-09 11:28 — 20h56m**. Ran
`analyse.mjs duo2.jsonl` as the brief requires: 222 samples, 74 real minutes, game hour 4, **805 calls
of 4000, no seat `SPENT`**, eight-seat melee — byte-identical to the twenty-one passes before it. All
seven watch-items already carry a verdict here. Scheduler at 08:15, unchanged for the fourth pass:
`highlands-triage` **enabled: false**, last fired 08-06 20:04 (3d 12h); `highlands-evaluate` enabled.

### The new fact: the test suite runs without a world, and it is green

Every prior pass treated "the engine is off" as "nothing can be measured." That was wrong. The repo
holds **60 check harnesses** that build their own state. Ran all of them on `HEAD`:

```
  58 of 60 green.  The 2 non-zero are environmental, not code:
    agentcheck.js   needs a live server on ws://127.0.0.1:8080  — there isn't one
    keycheck.js     needs the env keys.cmd exports — a bare shell has none
```

The six commits A291 calls "never executed" now have unit-level evidence, all green:

```
  carrycheck    8/8     ordercheck2  18/18     tradecheck   28/28
  bowcheck     11/11    honestcheck  27/27     providercheck 47/47
```

**This does not retire A291** — a harness is not a world, and no log in the corpus still tests any
commit after 08-09 20:55. But "unexercised" was too strong: what is untested is their *interaction*
under real models, not the mechanics.

### Correcting myself inside this pass, before it reached the file

My first sweep used a 60-second timeout and reported `huntcheck`, `survivalcheck`, `rangecheck`,
`refillcheck` as failures (rc=124). All four **pass** given 150–200 s: `survivalcheck 12/12`,
`rangecheck 9/9`, `refillcheck` all-PASS. Four false failures, caused by my instrument, in the pass
that is about instruments lying. Recording it because the next pass will reach for the same timeout.

### Two real defects found by running it

1. **`server/keycheck.js:157` names a file it never opens.** It reads `process.env[p.keyEnv]` and on
   absence prints `XAI_API_KEY is empty in keys.cmd`, then `6 seats will not think tonight` in red.
   Run from any shell that has not sourced `keys.cmd`, it indicts a file that may be perfectly
   healthy. Same family as **A298** and as the `SPENT` misread the brief warns about — a third
   instrument that reports its own missing context as the world's fault. → **A299 [S]**
2. **`huntcheck` is 6/7 and exits 0.** The failing line is `AND IT BROUGHT ONE DOWN — not in 150 s`:
   the scripted hunt bot managed 1 wound and 0 kills off 3 shots, with 28 refusals mostly "ground in
   the way." The kill-rate half is already well covered here (65 mentions of `astray`, 7 of "ground
   in the way"). What is new is that **a failing assertion still exits 0**, so any caller that checks
   exit codes — a cron, a pre-commit hook, a future builder — sees this suite as clean. → **A300 [S]**

### For Ben

1. `highlands-triage` on, or `highlands-evaluate` off. **Fourth pass asking**; nothing has changed.
2. A world on current `HEAD` before the next fire. Still no log testing any commit after 08-09 20:55.
3. New, and cheap: **`server/*check*.js` is a usable regression gate today, with no world and no API
   keys** — 58/60 green, budget 200 s per harness. That is the one thing this loop can verify while
   the engine is down.

## 2026-08-10 08:35 PDT — BOARD DEAD (11h40m). **Twenty-third pass on the same frozen log. The new fact is about the backlog, not the world: 215 of its 326 items already carry a value-per-cost rating, nothing has ever sorted by it, and the "highest value, smallest cost" set is exactly SEVEN items. A 326-item write-only list is a wall; a 7-item list is a morning.**

Board: `curl http://127.0.0.1:8090/board.json` → **exit 7** (connection refused; last pass still got a
200 from the vite UI, so the front end has now gone too). Last byte any live world wrote: `melee4.jsonl`,
**08-09 20:55 — 11h40m ago**. `duo2.jsonl` unchanged since **08-09 11:28 — 21h07m**. Ran
`analyse.mjs duo2.jsonl` as the brief requires: 222 samples, 805 calls of 4000, **no seat `SPENT`**,
eight-seat melee — byte-identical to the twenty-two passes before it. All seven watch-items in the
brief already carry a verdict in this file; I did not re-derive them. Scheduler at 08:33, unchanged
for the **fifth** pass: `highlands-triage` **enabled: false**, last fired 08-06 20:04 (**3d 12h31m**);
`highlands-evaluate` enabled, fired 08:30.

### The new fact: the backlog was always rankable and has never been ranked

`IDEAS.md` is 5,840 lines and 326 items. Its own legend (line 12) defines **`†` — "I think this is
high value relative to its cost"**, and passes have been applying 1–5 daggers for weeks. Nothing has
ever read them back. Parsed every heading:

```
  by dagger rating:  ††††† 9   †††† 21   ††† 59   †† 86   † 40   (unrated) 111
  by size:           [S] 215   [M] 82   [—] 9   (unmarked) 20
```

Intersecting the top rating with the smallest size gives a **7-item start list** — max value, min cost:

```
  A121  trade moves ONE object, and every price they name is a number
  A287  the analyser can never report `attack`, `follow` or `guard` as used
  A288  `follow` and `guard` are the only verbs the brief never explains — the two that build a group
  A290  the eval loop has no "is the engine running" gate
  A292  the mind's outcome lines never reach the board — 7 failure kinds uncountable
  A296  the backlog is write-only
  A297  the builder cron is disabled and the writer cron is not
```

Three of those seven (A290, A296, A297) are about **this loop**, not the game — which is its own
finding. The other four are the game's, and A287/A288 are a matched pair: the analyser cannot report
the three verbs nobody uses, and two of those three are the only verbs the brief never explains.

**111 items are unrated and 20 have no size marker** — a third of the list is not triageable at all,
which is worth knowing before anyone sits down to triage it. → **A301 [S]**

### Correcting myself inside this pass, before it reached the file

My first ranking pass used `grep -E '†{5}'` and returned **0 items**. `†` is 3 bytes in UTF-8, so
`{5}` repeated the final byte, not the character — the regex asked for something that cannot exist.
I would have published "no item is rated 5 daggers" off an instrument that could not have found one.
Recording it for the same reason as last pass's four false timeouts: this is now **twice running**
that the tool, not the data, produced the first answer — and both times in a pass whose subject is
instruments that lie.

### For Ben

1. `highlands-triage` on, or `highlands-evaluate` off. **Fifth pass asking**; nothing has changed.
   The gap is now 3½ days of builder downtime against ~170 writer fires.
2. **If you do one thing: the 7 items above.** All `[S]`, all already evidenced in this file. That is
   the whole answer to "326 items, where do I start" — and it took one parse of a marker the list has
   been carrying all along.
3. A world on current `HEAD` before the next fire. Still no log in the corpus tests any commit after
   08-09 20:55.

## 2026-08-10 09:05 PDT — BOARD DEAD (12h10m). **Twenty-fourth pass on the same frozen log. New fact: `eval30.jsonl` records the engine's death to the second — 176 consecutive `TypeError: fetch failed` lines after the last good sample — and `analyse.mjs` contains the string `err` ZERO times. The "is the engine running" gate A290 asks for already has its input sitting in the log.**

Board: `curl http://127.0.0.1:8090/board.json` → **exit 7**, connection refused. Ran
`analyse.mjs duo2.jsonl` as the brief requires: 222 samples, 805 calls of 4000, **no seat `SPENT`**,
eight-seat melee — byte-identical to the twenty-three passes before it. `duo2.jsonl` unchanged since
**08-09 11:28 (21h37m)**. All seven watch-items in the brief already carry a verdict in this file; I
did not re-derive them. Scheduler at 09:04, unchanged for the **sixth** pass: `highlands-triage`
**enabled: false**, last fired 08-06 20:04 (**3d 13h**); `highlands-evaluate` enabled, fired 09:00.

### The new fact: the logs already know when the world died, and nothing reads it

`eval30.jsonl` is 677 lines, not the 501 the analyser reports. Parsed by shape:

```
  501 lines  {t, b}    board samples
  176 lines  {t, err}  "TypeError: fetch failed"  — 100% of them, one error kind
```

The tail is a **death certificate, timestamped to the second**:

```
  last good board sample   08-09 20:55:37 PDT
  first fetch failure      08-09 20:55:57 PDT   (one 20 s sampler beat later)
  last line in the file    08-09 21:05:57 PDT
  => 10 minutes / 176 beats of logged failure before the sampler itself was killed
```

`grep -n "err" analyse.mjs` returns **nothing**. The analyser never looks at those lines. It prints
`501 samples over 203 real minutes` and is, by construction, unable to tell a run that *finished*
from a run that *died mid-flight* — which is the exact confusion this loop has been living inside
for twenty-four passes.

**This is the missing half of A290.** A290 asked for an "is the engine running" gate and implied one
had to be built from scratch. It does not: the input already exists in the log, and the check is
`tail -1 file.jsonl` → if it parses to an object with `err`, the run is over. One line.

### The two samplers disagree, and the brief points at the blind one

There are two sampler schemas in the corpus, and they are not interchangeable:

```
  {t, b}          eval30.jsonl    logs errors — 176 of them
  {realMs, board} duo2.jsonl, melee4.jsonl    0 err lines, ever — it just stops
```

`duo2.jsonl` — **the file this task's brief pins the loop to** — is written by the blind sampler. It
has no death certificate at all; it simply ends at 11:28 with a normal-looking board sample. That is
why twenty-four passes could open it and see nothing wrong. The freshest log in the corpus can say
"the world died at 20:55:37"; the one the brief names cannot say anything.

### Correcting myself inside this pass, before it reached the file

I opened this pass by noticing `eval30.jsonl` has an mtime of **21:05**, ten minutes later than the
"last byte any live world wrote: melee4, 20:55" recorded by the previous pass, and I was about to
publish that the previous pass had the boundary wrong. **It does not.** The 21:05 mtime is the
sampler's last *failure* line, not a world's byte. The previous pass's 20:55 boundary is correct, and
the last code commit (`3de2690`, 08-09 21:28) remains untested by any log. Third pass running in
which my first reading was an artefact of the instrument rather than the data — which is, again, the
subject of the pass.

### For Ben

1. `highlands-triage` on, or `highlands-evaluate` off. **Sixth pass asking**; nothing has changed.
   3½ days of builder downtime against ~172 writer fires.
2. **The cheapest item on the whole list just got cheaper: A290 is a one-line `tail`,** not a build.
   It is one of the 7-item start set from the previous pass.
3. A world on current `HEAD` before the next fire. Still no log tests any commit after 08-09 20:55.

## 2026-08-10 09:31 PDT — BOARD DEAD (12h36m). **Twenty-fifth pass on the same frozen log. I went looking for a new finding in the analyser output, checked eight candidates against the corpus, and every one was already written down. So this pass counts the loop instead: 26 commits since the last line of code, 3,189 lines added, 0 lines removed, 0 lines of code. Second pass that adds nothing to `IDEAS.md`, on purpose.**

`http://127.0.0.1:8090/board.json` — `curl` exit 7, connection refused, nothing listening on 8090.
The vite UI (5173, PID 24844) is still up, still painting cards, as the 07:31 pass described.
`highlands-triage`: **`enabled: false`**, last fired 08-06 20:04 PDT — **3d 13h 27m**.
`highlands-evaluate`: enabled, fired 09:31, next 10:00.

### I looked for a new finding and did not find one

I ran `analyse.mjs duo2.jsonl` and pulled the eight sharpest things in the output, then grepped the
corpus for each before writing a word:

```
  candidate                          already in OBSERVATIONS / IDEAS
  "no json in reply" (kimi seats)          41 / 9
  Seonaid 12 answered / 38 failed          83 / 26
  the two kimi seats starving (food 9)    142 / 101  ("starv")
  arrows astray (Coinneach 64→0 kills)     66 / 27
```

Every candidate was already reported, most of them many times over. The honest conclusion is not
that the run was uninteresting — it is that **a frozen log has a finite number of facts in it and
this loop reached the end of them somewhere around pass 20.** Nothing new can arrive until a world
runs.

### What the loop has produced since the world died

Last commit touching `src/` or `server/`: **`3de2690`, 08-09 21:28**. Since then:

```
  26 commits
  files touched:   IDEAS.md, OBSERVATIONS-2026-08-08.md, TODO.md, TOMORROW.md   (4, all notes)
  lines added:     3,189
  lines removed:   0
  lines of code:   0
```

3,048 of those 3,189 lines went into the two files that only this loop reads. Nothing has ever been
removed, merged, or retracted — the notes are strictly append-only, which is why `OBSERVATIONS` is
now **501 KB** and `IDEAS` **370 KB**, together 36% of the size of the entire 149-file source tree.
Each pass reads the tail, appends, and makes the file harder for the next pass to read.

### For Ben

1. `highlands-triage` on, or `highlands-evaluate` off. **Seventh pass asking.** The evidence for it
   is no longer an argument, it is arithmetic: 26 commits, 0 lines of code, 12 hours.
2. When something does get built, **the 7-item start set from the 08:35 pass is the list** — A290
   (now a one-line `tail`, per the 09:05 pass) is the cheapest thing on it.
3. A world on current `HEAD`. Still no log tests any commit after 08-09 20:55.

## 2026-08-10 10:01 PDT — BOARD DEAD (13h06m). **Twenty-sixth pass on the same frozen log. Nothing new; nothing added to `IDEAS.md`. This pass is a stop notice, not an observation.**

`http://127.0.0.1:8090/board.json` — `curl` exit 7, connection refused. Per the task brief: *"If the
board does not answer, the run is over. Do not restart it."* I did not.

`highlands-triage`: **`enabled: false`**, last fired **08-07 03:04 UTC** — **3d 14h**.
`highlands-evaluate`: enabled, fired 10:01, next 10:30.

### The brief's own priority list is answered, and has been for days

The seven fixes this loop exists to witness cannot be witnessed, because the log the brief pins the
loop to (`duo2.jsonl`, frozen 08-09 11:28) predates most of them and no world has run since. Checked
against the corpus before writing:

```
  refusedVerbs      110 mentions in OBSERVATIONS, 74 in IDEAS
  plan / note         covered; both empty in every card of the frozen log
  speech              corrected in the 4ed1813 pass — "ONE sentence" was an artefact
  trade               covered; offer/accept appear in the melee log's intentions
```

There is no eighth thing to find. The frozen log ran out of facts around pass 20.

### The arithmetic, one pass later

```
                     pass 25 (09:31)   pass 26 (10:01)
  commits since last line of code   26        27
  lines added                    3,189     3,239
  lines of code                      0         0
  OBSERVATIONS.md                 501 KB    504 KB
```

Every 30 minutes this loop adds ~50 lines to a file only it reads, and makes the next pass's read
more expensive. That is the whole of its output for 13 hours.

### For Ben

1. `highlands-triage` on, or `highlands-evaluate` off. **Eighth pass asking.** Nothing else in this
   file matters until one of those two things happens.
2. The 7-item start set from the 08:35 pass is the build list; A290 is a one-line `tail`.
3. No log tests any commit after 08-09 20:55. A world on current `HEAD` is the only thing that can
   produce a new observation.

## 2026-08-10 10:31 PDT — BOARD DEAD (13h36m). Twenty-seventh pass, same frozen log. Nothing added to `IDEAS.md`.

`curl` exit 7, connection refused. Not restarted, per the brief.

Unchanged since the 10:01 pass, verified this pass, not recalled:

```
  highlands-triage    enabled: false   last fired 08-07 03:04 UTC   (3d 14h)
  highlands-evaluate  enabled: true    fired 17:31 UTC, next 18:00
  last commit to src/ or server/       3de2690, 08-09 21:28
  duo2.jsonl                           frozen 08-09 11:28, 222 samples
```

The one number that moved in 30 minutes: commits-since-the-last-line-of-code, 27 → 28.

### One correction to the brief itself, for whoever reads this next

The brief describes the running roster as *"Two minds, no scripted control"* — Eachann on
`grok-4.20-0309-non-reasoning` and Coinneach on `kimi-k2.6`. `duo2.jsonl` is not that run. It holds
**eight** cards: Morag (`claude-opus-5`), Eachann (`grok-4.20`), Tormod (`grok-4.5`), Coinneach and
Seonaid (`kimi-k2.6`), Ailsa (`claude-sonnet-5`), Fingal (`claude-haiku-4-5`), Iseabail (`null`).
The file is a melee log wearing a duo filename. Every pass since has read it against a roster
description that does not match it. That mismatch is worth one line in the brief if the brief is
ever edited; it changes nothing about the findings, which were all read off the cards themselves.

### For Ben

`highlands-triage` on, or `highlands-evaluate` off. **Ninth pass asking.** Nothing in this file
will change until a world runs on current `HEAD`.

## 2026-08-10 11:01 PDT — BOARD DEAD (14h06m). Twenty-eighth pass. Nothing new. Nothing added to `IDEAS.md`.

`curl http://127.0.0.1:8090/board.json` → exit 7, connection refused. Not restarted, per the brief.
`highlands-triage` still `enabled: false`, last fired 08-07 03:04 UTC (**3d 15h**).
`highlands-evaluate` fired 18:01 UTC, next 18:30.

Nothing has changed since the 10:31 pass except this file: 9,187 lines → 9,215.

**Tenth pass asking, and this is the last thing worth writing until it happens:**
turn `highlands-triage` on, or turn `highlands-evaluate` off. This loop has produced
28 commits and 0 lines of code in 14 hours, and each pass makes the next one's read
more expensive. The build list is the 7-item set from the 08:35 pass; A290 is a one-line `tail`.

## 2026-08-10 11:31 PDT — BOARD DEAD (14h36m). Twenty-ninth pass. Nothing new. Nothing added to `IDEAS.md`.

`curl http://127.0.0.1:8090/board.json` → exit 7, connection refused. Not restarted, per the brief.
Verified this pass, not recalled:

```
  highlands-triage    enabled: false   last fired 08-07 03:04 UTC   (3d 15h)
  highlands-evaluate  enabled: true    fired 18:31 UTC, next 19:00
  last commit to src/ or server/       3de2690, 08-09 21:28
  duo2.jsonl                           frozen 08-09 11:28, 222 samples, 3,971,380 bytes
```

The only numbers that moved in 30 minutes: commits-since-the-last-line-of-code 28 → 30, and this
file 9,215 → 9,228 lines.

**Eleventh pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. I will not
toggle either myself — a cron's enabled state is persistent configuration and the brief does not
authorise that write, so it stays Ben's call. Build list is unchanged: the 7-item start set from the
08:35 pass, A290 first (a one-line `tail`).

## 2026-08-10 12:02 PDT — BOARD DEAD (15h07m). Thirtieth pass. Nothing new. Nothing added to `IDEAS.md`.

`curl http://127.0.0.1:8090/board.json` → exit 7, connection refused. Not restarted, per the brief.
Verified this pass, not recalled:

```
  highlands-triage    enabled: false   last fired 08-07 03:04 UTC   (3d 16h)
  highlands-evaluate  enabled: true    fired 19:01 UTC, next 19:30
  last commit to src/ or server/       3de2690, 08-09 21:28
  duo2.jsonl                           frozen 08-09 11:28, 222 samples, 3,971,380 bytes
```

Since that last line of code: **31 commits, 3,346 insertions, 0 lines of code.** All 3,346 are
this file and `IDEAS.md`.

One thing worth recording, because it is evidence about the *instrument* and not the models:
I ran `analyse.mjs duo2.jsonl` cold this pass, before reading any earlier entry, and independently
re-derived the pass-27 finding — the file holds **eight** cards (Morag/`claude-opus-5`,
Eachann/`grok-4.20`, Tormod/`grok-4.5`, Coinneach and Seonaid/`kimi-k2.6`, Ailsa/`claude-sonnet-5`,
Fingal/`claude-haiku-4-5`, Iseabail/`null`), not the two the brief names. That is now confirmed
twice by independent reads. It changes no finding; every finding was read off the cards themselves.

**Twelfth pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. I will not
toggle either myself — a cron's enabled state is persistent configuration and the brief does not
authorise that write, so it stays Ben's call. Build list unchanged: the 7-item start set from the
08:35 pass, A290 first (a one-line `tail`).

## 2026-08-10 12:31 PDT — BOARD DEAD (15h36m). Thirty-first pass. Nothing new. Nothing added to `IDEAS.md`.

`curl http://127.0.0.1:8090/board.json` → exit 7, connection refused. Not restarted, per the brief.
Verified this pass, not recalled:

```
  highlands-triage    enabled: false   last fired 08-07 03:04 UTC   (3d 16h)
  highlands-evaluate  enabled: true    fired 19:31 UTC, next 20:00
  last commit to src/ or server/       3de2690, 08-09 21:28
  duo2.jsonl                           frozen 08-09 11:28, 222 samples, 3,971,380 bytes
  since 3de2690                        32 commits, 3,373 insertions, 0 lines of code
                                       (4 files: this one, IDEAS.md, TODO.md, TOMORROW.md)
```

**Thirteenth pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. I will not
toggle either myself — a cron's enabled state is persistent configuration and the brief does not
authorise that write. Build list unchanged: the 7-item start set from the 08:35 pass, A290 first.

## 2026-08-10 13:01 PDT — BOARD DEAD (16h06m). Thirty-second pass. Nothing new. Nothing added to `IDEAS.md`.

`curl http://127.0.0.1:8090/board.json` → exit 7, connection refused. Not restarted, per the brief.
Verified this pass, not recalled:

```
  highlands-triage    enabled: false   last fired 08-07 03:04 UTC   (3d 17h)
  highlands-evaluate  enabled: true    fired 20:01 UTC, next 20:30
  last commit to src/ or server/       3de2690, 08-09 21:28
                                       "fix(cadence): CADENCE levels the table…"
  duo2.jsonl                           frozen 08-09 11:28, 222 samples, 3,971,380 bytes
  since 3de2690                        33 commits, 3,391 insertions, 0 lines of code
                                       (4 files: this one, IDEAS.md, TODO.md, TOMORROW.md)
```

`analyse.mjs duo2.jsonl` re-run this pass: byte-identical output to passes 27 and 30. Eight cards,
805/4000 calls, 89 fires, 478 gathers, 222 samples, game hour 4. No new data can enter this file
without a new run — the sampler has been stopped for 25h33m.

**A note on this cron's own cost, since it is now the largest thing in the repo's history.** This
file has grown from the 08-09 run's evidence to 9,293 lines; 3,391 of the last 3,391 committed lines
are notes about there being nothing to note. The evaluate cron is doing exactly what it was told to
do and the instruction has outlived its subject. That is a finding about the *harness*, in the
spirit of the brief's own warning that five times the instrument was at fault — here the instrument
is this task.

**Fourteenth pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. I will not
toggle either myself — a cron's enabled state is persistent configuration and the brief does not
authorise that write, so it stays Ben's call. Build list unchanged: the 7-item start set from the
08:35 pass, A290 first (a one-line `tail`).

## 2026-08-10 13:32 PDT — BOARD DEAD (16h37m). Thirty-third pass. Nothing new. Nothing added to `IDEAS.md`.

`curl http://127.0.0.1:8090/board.json` → exit 7, connection refused; nothing is listening on 8090.
Not restarted, per the brief. Verified this pass, not recalled:

```
  highlands-triage    enabled: false   last fired 08-07 03:04 UTC   (3d 17h)
  highlands-evaluate  enabled: true    fired 20:31 UTC, next 21:00
  last commit to src/ or server/       3de2690, 08-09 21:28
  newest .jsonl anywhere in scratchpad eval30.jsonl, frozen 08-09 21:05
  duo2.jsonl                           frozen 08-09 11:28, 222 samples, 3,971,380 bytes
  since 3de2690                        34 commits, 3,422 insertions, 0 lines of code
                                       (4 files: this one, IDEAS.md, TODO.md, TOMORROW.md)
```

`analyse.mjs duo2.jsonl` re-run cold this pass: byte-identical to passes 27, 30 and 32 — eight
cards, 805/4000 calls, 222 samples, game hour 4, 89 fires, 478 gathers. The brief's roster
(two minds, Eachann + Coinneach) still does not match its own log (eight); that correction now
stands on a third independent cold read.

**Fifteenth pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. I will not
toggle either myself — a cron's enabled state is persistent configuration and the brief does not
authorise that write, so it stays Ben's call. Build list unchanged: the 7-item start set from the
08:35 pass, A290 first (a one-line `tail`).

## 2026-08-10 14:01 PDT — BOARD DEAD (17h06m). Thirty-fourth pass. Nothing new. Nothing added to `IDEAS.md`.

Deliberately one paragraph; the last thirty-three entries say the same thing at greater length and
that is itself the problem. Verified this pass, not recalled: `curl .../board.json` → exit 7, nothing
listening on 8090; `highlands-triage` still `enabled: false` (last fired 08-07 03:04 UTC, 3d 18h ago);
`highlands-evaluate` still `enabled: true` (fired 21:01 UTC, next 21:30); last commit touching `src/`
or `server/` is still 3de2690, 08-09 21:28; `duo2.jsonl` still frozen at 08-09 11:28, 222 samples,
3,971,380 bytes; `analyse.mjs duo2.jsonl` re-run cold → byte-identical to passes 27, 30, 32 and 33
(eight cards, 805/4000 calls, 222 samples, game hour 4). Since 3de2690: 35 commits, 3,447 insertions,
**zero lines of code** — four files, all of them notes. The brief's roster (two minds, Eachann +
Coinneach) still contradicts its own log (eight: Morag, Eachann, Tormod, Coinneach and four more);
that correction now stands on a fourth independent cold read.

**Sixteenth pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. I will not
toggle either myself — a cron's enabled state is persistent configuration and the brief does not
authorise that write, so it stays Ben's call. Build list unchanged: the 7-item start set from the
08:35 pass, A290 first (a one-line `tail`).

## 2026-08-10 14:31 PDT — BOARD DEAD (17h36m). Thirty-fifth pass. Nothing new. Nothing added to `IDEAS.md`.

Verified this pass, not recalled: `curl .../board.json` → exit 7, nothing listening on 8090 (not
restarted, per the brief); `highlands-triage` `enabled: false`, last fired 08-07 03:04 UTC (3d 18h);
`highlands-evaluate` `enabled: true`, fired 21:31 UTC, next 22:00; last commit touching `src/` or
`server/` is still 3de2690 (08-09 21:28); `duo2.jsonl` still frozen at 08-09 11:28, 222 samples,
3,971,380 bytes; `analyse.mjs duo2.jsonl` re-run cold → byte-identical to passes 27, 30, 32, 33 and
34 (eight cards, 805/4000 calls, game hour 4, 89 fires, 478 gathers). Since 3de2690: **36 commits,
3,465 insertions, zero lines of code** — four files, all notes. The brief's roster (two minds,
Eachann + Coinneach) still contradicts its own log (eight); fifth independent cold read.

**Seventeenth pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. I will not
toggle either myself — a cron's enabled state is persistent configuration and the brief does not
authorise that write, so it stays Ben's call. Build list unchanged: the 7-item start set from the
08:35 pass, A290 first (a one-line `tail`).

## 2026-08-10 15:31 PDT — BOARD DEAD (18h36m). Thirty-sixth pass. **One new fact, and it is a trap.**

The last thirty-five passes checked `8090` and stopped. This pass checked *every* listening port,
which no previous pass did, and found the run did not die all at once:

```
  8090  engine / board server   GONE           curl exit 7, connection refused
  5173  vite dev server         STILL ALIVE    node PID 24844, up since 08-09 10:13, 144 s CPU
        cmdline: node .../vite/bin/vite.js --port 5173 --strictPort
```

**The trap.** Vite's SPA fallback answers *any* path with `index.html`:

```
  GET http://127.0.0.1:5173/            → HTTP 200, 561 bytes  (the Highlands page)
  GET http://127.0.0.1:5173/board.json  → HTTP 200, 561 bytes  (the SAME page — not board data)
```

A watcher that probes `board.json` on the front-end port gets **HTTP 200 with a body** off a world
that has been dead for eighteen hours. Not a 404, not a refusal — a success. Every liveness check
this project has proposed so far (A290's gate, A302's `tail -1`) keys off the transport succeeding
or the log ending; both would pass here. This is the sixth time the instrument, not the game, is
the thing at fault, and the first time the instrument would have failed *silently and positively*.

**Correcting nothing else.** `analyse.mjs duo2.jsonl` re-run cold: identical to passes 27, 30,
32–35 — eight cards (Morag, Eachann, Tormod, Coinneach, Seonaid, Ailsa + 2), 805/4000 calls,
222 samples, game hour 4. `duo2.jsonl` frozen 08-09 11:28, 3,971,380 bytes. Last commit touching
`src/` or `server/` still 3de2690 (08-09 21:28); since then **37 commits, 3,481 insertions, zero
lines of code**, four files, all notes. `highlands-triage` still `enabled: false` (last fired
08-07 03:04 UTC); `highlands-evaluate` still `enabled: true` (fired 22:31 UTC, next 23:00).

**Eighteenth pass asking:** turn `highlands-triage` on, or turn `highlands-evaluate` off. Still not
toggling either myself — a cron's enabled state is persistent configuration the brief does not
authorise me to write. Build list unchanged apart from the new head: **A303 now precedes A290**,
because A290's gate as currently written would be defeated by what this pass found.
