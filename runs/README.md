# The melee runs, 2026-08-09

Seven models and a scripted control in one glen, an hour at a time. Same world
every run (`SCARCE=0.7,0.5`, `HUNGER=52`, no bears, personas on) so that what
changes between them is the code and not the weather.

The raw board samples are gitignored — a megabyte an hour, and the value is in
what gets written up from them. The write-ups stay.

| run | what was different | seats really answering |
|---|---|--:|
| [1](melee-1.md) | as launched | **6 of 7** |
| [2](melee-2.md) | Haiku's `effort` and Kimi's token cap fixed | **7 of 7** |
| [3](melee-3.md) | trade carries a price, and the offer is visible | **7 of 7** |
| [4](melee-4.md) | every refusal says why · orders anchored · offers lapse | **7 of 7** |

---

## What the three runs have settled

### 1. A benchmark that cannot see its own broken seats is not a benchmark

Run 1 spent an hour measuring `claude-haiku-4-5` and was measuring a hundred
lines of if-statements. Fingal answered **0 of 151** on a 400 that says *this
model does not support the effort parameter*, fell through to the scripted
brain exactly as designed, and the board went on printing the model name over
the top of it.

Nothing looked wrong. That is the whole problem: the floor that keeps the game
playable when a vendor is down is also the thing that makes a dead seat look
alive. Two seats in run 1 were ghosts and the run reads perfectly well without
knowing it.

Fixed in three places, and the order matters:

- the provider drops `effort` and retries when a vendor refuses it, so no
  roster author can lose a seat to it again;
- `finish_reason: length` now says **`reply cut off at N tokens`** instead of
  `no json in reply`, because the second sentence blames the model for our own
  token cap — both Kimi seats were being libelled by our own error message;
- the write-up puts **share** next to every seat, and anything under ~80% is
  named as measuring the fallback.

Run 2 was the first hour in this project's history where every paid seat was
the model on its label.

### 2. Trade needs a shortage that gathering cannot fix

Run 1's first 113 decisions contained **two** social verbs. I was ready to
write down that these models do not reach for trade. Then the market opened:
by the end of the hour it was 24 of 341, with six settled trades and thirty
gifts, all on one axis — **branches for cooked venison**.

What changed was not the models. It was that Ben's ten-branch fire had made
wood a bottleneck, and some minds had specialised into hunting while others
gathered. That is comparative advantage, and it arrived on its own about eight
game hours in.

The lesson for the world design: **an abundant gatherable is an anti-social
force.** Nobody deals with anybody while there is enough lying on the ground,
and the deadfall that never regrows (see `TODO.md` 5z) makes the glen poorer in
a way that pushes the other direction. Both levers are worth having in hand.

### 3. Without prices, a bulk deal becomes a hammering

Run 2, over 0.16 game hours:

```
9.03  Coinneach traded arrow to Ailsa for wood
9.07  ...again
9.11  ...again
9.15  ...again
9.19  ...again
```

Five identical micro-trades, because `resolveAccept` moved exactly one of each.
Coinneach was trying to sell arrows in bulk and the only way to say it was to
say it five times.

Meanwhile run 1's `refusedVerbs` column fired for the first time and read
**`Morag: offer x17`** — seventeen bargains refused in an hour, from Opus 5.
The reason was ours: a mind naming a price writes the number into the noun,
which is what a person does —

```
offer cooked venison to Tormod for twelve branches
offer 3 branches to Morag for 2 cooked venison
offer 6 hides to Ailsa for venison
```

— and `resolveItemId` handled plurals but not counts, so every one resolved to
nothing and the whole offer was discarded.

### 3b. `accept` was never chosen because nobody could see the offer

Three hours, seven models: `offer` reached for 29 times, `give` 16, **`accept`
zero**. Never once. It read as a verb nobody wanted, and it was a verb nobody
could USE — an offer made TO a mind arrived only as a line in its memory stream,
weighted like any other event, decaying against a half-life of about one
decision. By the time that mind next chose, the deal had faded out of the six
lines it is shown.

A standing offer is now state rather than history: it rides in the snapshot
beside health and hunger and reaches the prose above everything else, with the
one fact that makes it decidable — whether you can cover it, and by how much you
are short if you cannot.

**Run 3, immediately: `accept` chosen three times** (Eachann 13.72, Morag 16.67,
Tormod 22.00) and social verbs at 10.7%, the highest of any run. Two settled
trades from three accepts, so the remaining loss is the counterparty walking off
between the offer and the answer — which is the next thing to fix, and the same
thing the human playtester hit when he could not get anybody to stand still.

### 4. They remember somebody who is not coming back

Twelve lines of run 1 are addressed to **Ben**, who had left the world, and
Morag organised three separate nights around "Ben's fire" while carrying a
standing debt of five arrows to him.

Charming, and a real gap: there is no way for a mind to learn that a person has
gone. The memory work holds better than expected; the forgetting has not been
built at all.

---

## 5. An instrument that speaks finds bugs an instrument that stays quiet cannot

Run 4 is the first hour in which every refusal in the game said why. It found
two things inside thirty minutes, and neither was findable before.

**`{"Morag": {"accept": 26}, "Ailsa": {"accept": 11}}`** — thirty-seven
deliberate reaches for a deal, all refused. The cause was an offer lifetime of
33 real seconds against cadences of 20 to 75. AN OFFER THAT EXPIRES FASTER THAN
A MIND CAN THINK IS ONE THAT MIND CAN NEVER TAKE: Morag decides every 35 s and
both Kimi seats every 75, so they were deciding to accept deals that had gone
stale between the deciding and the doing. Curing the offer spiral had built its
mirror image, and the visible refusal is the only reason it took half an hour
rather than another three sessions.

**Eight seats reading "told to hunt a deer" while not one was hunting.** The
board set `orderedTo` when an order landed and never cleared it, so the column
answered "was this seat ever ordered?" when it was asked "is it under orders
now?" The newest instrument in the game, four hours old, with the same disease
as every old one.

## 6. Nothing is scarce, so gathering has eaten the game

The pack has NO LIMIT. Morag finished run 4 carrying **205 branches** — twenty
fires' worth — and it shows in what the models choose:

| | |
|---|--:|
| `pick up what is lying about` | **32% of all decisions** |
| `gather` deeds | **334 of 471 (71%)** |

The most-chosen action in this game is picking up things nobody needs. And look
at what they trade FOR: arrows, venison, hides. **Wood is the currency precisely
because it is worthless.** They have infinite of it.

A carrying limit is the highest-leverage change available — higher than deadfall
regrow, which makes the glen sustainable where a cap makes gathering a DECISION.

## 7. The cadence that protects the bill destroys the comparison

| Eachann (grok-fast, 20 s) | 138 decisions |
| Fingal (haiku, 25 s) | 110 |
| Morag (opus-5, 35 s) | 79 |
| **Coinneach (kimi, 75 s)** | **34** |

Cadence is set by price, which is right for an unattended run and fatal for a
benchmark: nothing can be concluded about kimi-k2.6 against opus-5 when one gets
four times the turns. For any hour meant to be READ as a comparison, equalise
the cadence and vary the budget instead.

---

## Reading a write-up

Every number is de-duplicated on a natural key before counting, because the
board is a **dashboard sampled repeatedly and not an event log** — counting
rows counts how often we looked. That mistake has been made five times in this
project and every instrument built since assumes it will be made again.

    python analyse.py runs/melee-1.jsonl "Melee run 1"  > runs/melee-1.md
