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
