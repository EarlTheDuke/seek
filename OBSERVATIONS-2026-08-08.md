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
