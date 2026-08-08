# Next build — the plan, and what it turned into

Written 2026-08-07 after two six-model runs. **ALL FOUR PHASES ARE NOW BUILT.**
Kept as written, with the outcome of each recorded against it — the plan is more
useful as a record of what was predicted versus what was found than as a tidy
list of done items.

## OUTCOME, in one table

| phase | predicted | what it actually was |
|---|---|---|
| 1 make them play | "a commitment problem" | **an `===`.** `label === g.quarry` against labels carrying their article, so "hunt deer" ≠ "a deer" and the body silently roamed. One missing indefinite article cost two playtests. `quarrycheck` 5/5 |
| 2 `give` + verbs | small, big payoff | correct, and it found **two socket-only bugs**: `INTENT_KEYS` is an allow-list that silently drops unknown fields, and `give` was not edge-detected so a held press handed over the whole stack. `givecheck` 9/9, `duelcheck` 7/7 |
| 3 gold | "blocked behind trading" | correct, shipped with the sink stated plainly as *other people*. `goldcheck` 11/11 — and it deliberately does not assert gold is valuable, because that is the experiment |
| 4 goblins | "the animation of cowardice is missing" | **narrower.** The cowardice was fully animated; it was never DESCRIBED. `goneToGround` lived only on the server, so a routed pack reported itself as `"alert"` while standing still. One bit on the wire |

Nothing in phase 4 needed a behaviour change, and `daylightFloor`, `commitAt`
and `breakAt` were not touched — exactly as the plan insisted.

---

## The plan as written

Two sources: what Ben asked for, and what the data showed. They point at
different things, and the data's item is the more urgent one — so the plan
interleaves them rather than doing one list then the other.

---

## THE ONE NUMBER THAT SHOULD DECIDE THE ORDER

Across two runs, six models, roughly 400 decisions:

| | arrows | kills | ended |
|---|---|---|---|
| Five paid models | **0** | **0** | five of seven **below the eat threshold** |
| Coinneach (kimi) | 37 | 0 | food 38 |
| **Iseabail — no model at all** | 29–34 | **2, then 0** | food 72–81, fed |

**The models cannot feed themselves.** By the end of run two, five of seven were
under `eatBelow: 45` and falling, with zero kills between them. The one player
with no mind at all was comfortable.

Everything else on this list is a feature. This is the game not working.

---

## THE PLAN

Four phases. Each ends somewhere you can stop.

```
PHASE 1  make them play          ── the blocker. Nothing else matters until this moves.
PHASE 2  give (+ verbs)          ── smallest change that makes the characters real
PHASE 3  gold, then price        ── needs phase 2 to mean anything
PHASE 4  goblin posture, PvP     ── independent; slot in whenever
```

---

## PHASE 1 — MAKE THEM PLAY  *(the blocker)*

**1.1 Find out why a model that decides to hunt never shoots.**
Five models, ~400 decisions, zero arrows. This is not marksmanship — they never
get to the point of drawing. Coinneach fires (37) because kimi commits to one
quarry for 90 s at a time; the fast seats re-decide every 12–25 s and never
close. **Hypothesis to test first: re-deciding is resetting the approach.**
Instrument the gap between "chose hunt" and "drew the bow", per seat, against
cadence. If the correlation is with cadence, the fix is commitment, not aim.

**1.2 The shooting that does happen misses everything.**
Coinneach: 37 arrows, 0 wounds. Iseabail: 29 arrows, 1 wound. The refusals name
the cause and it is the project's oldest known finding — `ground in the way`,
`too far — slant 49, dy −25.5`. They are shooting up and down hillsides.
**Do not tune `shootRange`** — `STATE.md` has an 8-run A/B proving that makes it
worse. Go at a failing scenario.

**1.3 Turn hunger on by default.**
Run one ended with everyone at food 79 and nothing at stake. Run two, with more
hours on the clock, ended with five under the threshold — and *that* is when the
interesting behaviour appeared. `HUNGER=52` should be in `PLAY.cmd`, not a knob
nobody sets.

**1.4 Nobody ever makes an arrow.** Twelve is the starting kit; only the
scripted body ever knapped more. A model that runs dry is silently finished as a
hunter and nothing tells it so.

**Done when:** a paid model kills something, twice, in a run.

---

## PHASE 2 — `give`, and the verbs  *(smallest change with the biggest character payoff)*

**2.1 Add `give` to `GOAL_IDS`.** One-way, no negotiation. `GOAL_IDS` in
`src/minds/goals.js` is a closed list and a model **cannot invent an action** —
so today three of six written characters have no way to express themselves. A
hoarder who "will trade for meat", someone "slow to notice she is being used",
and a liar are all currently indistinguishable from each other in behaviour.

**2.2 Give the minds a verb for attacking a person.** `hunt` takes quarry and a
player is not quarry, so no mind can currently choose to shoot anyone. Same
shape of change as 2.1 and belongs in the same pass.

**2.3 Tell a mind it was shot BY someone.** It hears that it was hurt, not who
did it. Until that exists, retaliation is impossible and no duel can happen.

**Done when:** the hoarder refuses somebody and the generous one gives something
away, on the board, without being prompted.

---

## PHASE 3 — gold, then price

**3.1 Gold as an item.** `src/items/registry.js` has no notion of value or
currency — checked. `SimWorld.onCreatureHit` already rolls loot server-side, so
the drop hook exists. Goblins and trolls drop it.

**3.2 A sink.** Gold that only accumulates is a score, and a score changes
nobody's behaviour. **Do not ship 3.1 without 3.2**, or without saying plainly
that it does nothing yet.

**3.3 Offer/accept and price.** Two-sided proposal on the wire: new message
types plus another verb. Only worth it once `give` has shown the characters
differ.

---

## PHASE 4 — independent, slot in anywhere

**4.1 Goblin posture in daylight.** **Both arms confirmed in play:** stood among
them at noon and was ignored; went out at night and was attacked. The morale
maths is right — `daylightFloor: 0.12` against `commitAt: 0.5` means *"no number
of goblins fights at noon"*, exactly as written. **Do not retune
`daylightFloor`, `commitAt` or `breakAt`.**

What is missing is what a pack does *instead* of fighting: nothing. It mills
about looking like an AI that has crashed. `breakAt: 0.18` and `speeds.flee: 7.6`
both exist and 0.12 already sits below 0.18, so the rout path is either not
reached or does not produce visible flight. Find that; do not add a second
daylight rule beside the one already there.

*Second cause, also confirmed:* `countOpposition` counts every player within
34 m, so six agents standing near the human made a small pack refuse on numbers
alone. A daylight-only fix will still look broken in a crowd.

Prove it in `dangercheck` with an outcome: a goblin in charge range at noon ends
the tick **further away**; the same goblin at midnight ends it closer.

**4.2 PvP is already built — turn it on and look.** `canHarm`
(`src/sim/world.js:669`), `playerHitTest` (`:325`), arrow resolution against
players and a `glance` refusal event all exist; `shotcheck` covers them. The
rule is better than a toggle: party members never hurt each other, and between
strangers it depends on **where you are standing** — off in settled country, on
out in the strange, keyed to `placeStrangeness`. Knobs are `rules.pvp`,
`rules.pvpEverywhere`, `rules.pvpAboveStrangeness` in `SOCIAL.defaults`. The
missing pieces are 2.2 and 2.3, not the damage.

---

## SMALLER THINGS THE DATA TURNED UP

- **Kimi is the only unreliable seat** — about 3 answers in 8 live, against 7/7
  in isolation. Something about live conditions is still unexplained.
- **Two models have never spoken in two runs.** Fingal (haiku) has 63 decisions
  across both runs and zero lines. Worth knowing whether that is the model or
  the prompt.
- **Repeated lines.** Tormod said one identical sentence three times in a row,
  Morag twice. Possible loop.
- **The liar finding needs its control run.** Same roster, same seed, Tormod's
  character swapped for a truthful one. Two runs now show models abandoning
  hunts and naming "conflicting talk" as the reason; one adversarial agent
  suppressing five cooperative ones is a real result if it reproduces, and an
  anecdote until it does. **This is the cheapest valuable experiment on the
  list** — one word changed, one run.

---

## SUGGESTED FIRST SESSION

1. `HUNGER=52` into `PLAY.cmd` (1.3) — one line, changes every run after it.
2. The truthful-Tormod control run — one word, and it settles the headline
   finding either way.
3. Then 1.1: instrument decide-to-draw against cadence.

A short session that ends with either a reproduced result or a dead hypothesis,
and a measurement pointing straight at the blocker.
