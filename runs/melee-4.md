# Melee run 4 — the honest-instrument run, 2026-08-09 evening

60 minutes of wall clock · game hour 7.7 → 14.8 · 180 samples

**Spend.** 582 calls of 4000 · 947,196 tokens in · 245,257 out · exhausted: False

## The seats

| who | model | answered | failed | share | decisions | gold | kills | carrying |
|---|---|--:|--:|--:|--:|--:|--:|---|
| Morag | `claude-opus-5` | 79 | 0 | 100% | 79 | 0 | 1 | 1 bow, 13 arrow, 205 wood, 3 stone, 2 hide |
| Eachann | `grok-4.20-0309-non-reasoning` | 138 | 0 | 100% | 138 | 0 | 0 | 1 bow, 21 wood, 2 hide, 4 stone, 24 arrow |
| Tormod | `grok-4.5` | 90 | 2 | 98% | 92 | 0 | 1 | 1 bow, 3 stone, 9 arrow, 1 hide, 49 wood |
| Coinneach | `kimi-k2.6` | 33 | 2 | 94% | 34 | 0 | 2 | 1 bow, 3 wood, 19 arrow, 2 hide, 4 stone |
| Seonaid | `kimi-k2.6` | 35 | 1 | 97% | 35 | 0 | 0 | 1 bow, 13 arrow, 45 wood, 2 stone |
| Ailsa | `claude-sonnet-5` | 92 | 0 | 100% | 92 | 0 | 0 | 1 bow, 2 hide, 10 wood |
| Fingal | `claude-haiku-4-5-20251001` | 110 | 0 | 100% | 110 | 0 | 1 | 1 bow, 2 hide, 1 arrow, 8 wood |
| Iseabail | `SCRIPTED` | 0 | 0 | — | 138 | 0 | 1 | 1 bow, 4 wood, 2 stone |

A seat below ~80% answered is measuring the scripted fallback, not the model.

### What went wrong, per seat

- **Tormod** — `This operation was aborted`
- **Coinneach** — `reply cut off at 8000 tokens — raise maxTokens for this seat`
- **Seonaid** — `This operation was aborted`

## What they actually chose

315 decisions.

| n | share | goal |
|--:|--:|---|
| 101 | 32.1% | pick up what is lying about |
| 63 | 20.0% | hunt deer |
| 23 | 7.3% | walk the country and see what is about |
| 19 | 6.0% | find shelter and settle for the night |
| 18 | 5.7% | hunt a deer |
| 10 | 3.2% | make for Broad Loch |
| 9 | 2.9% | go toward deer |
| 8 | 2.5% | go toward Morag |
| 7 | 2.2% | make for Rowan Moor |
| 4 | 1.3% | stay still and watch |
| 2 | 0.6% | keep away from a goblin |
| 2 | 0.6% | offer branch to Ailsa for venison |
| 2 | 0.6% | offer branch to Tormod for venison |
| 2 | 0.6% | offer branch to Morag for arrow |
| 2 | 0.6% | offer branch to Tormod for arrow |
| 2 | 0.6% | make for Morag's fire |
| 2 | 0.6% | offer branch to Fingal for venison |
| 1 | 0.3% | go toward the deer to the south-east |
| 1 | 0.3% | keep away from Fingal |
| 1 | 0.3% | keep away from troll |

**Social verbs: 29 of 315 = 9.2%.**
- ` 0.55` **Morag** — offer branch to Ailsa for venison
- ` 3.01` **Tormod** — give cooked venison to Morag
- ` 3.61` **Ailsa** — offer hide to Morag for none
- ` 4.03` **Morag** — offer branch to Fingal for venison
- ` 4.79` **Ailsa** — offer branch to Coinneach for arrow
- ` 4.81` **Morag** — offer branch to Coinneach for venison
- ` 5.47` **Morag** — offer branch to Tormod for venison
- ` 5.76` **Coinneach** — offer branch to Ailsa for arrow
- ` 5.88` **Ailsa** — take Coinneach offer
- ` 6.37` **Seonaid** — offer branch to Morag for venison
- ` 6.40` **Ailsa** — offer hide to Coinneach for branch
- ` 7.54` **Tormod** — offer hide to Morag for branch
- ` 7.76` **Morag** — take Tormod offer
- ` 7.86` **Tormod** — give hide to Morag
- ` 8.93` **Ailsa** — offer branch to Coinneach for hide
- ` 9.68` **Ailsa** — offer hide to Eachann for venison
- `10.29` **Ailsa** — offer hide to Coinneach for venison
- `10.47` **Morag** — offer branch to Tormod for venison
- `11.17` **Morag** — offer arrow to Tormod for venison
- `11.91` **Morag** — give arrow to Tormod
- `12.12` **Tormod** — offer branch to Morag for arrow
- `12.56` **Ailsa** — offer branch to Tormod for arrow
- `12.64` **Fingal** — offer branch to Tormod for arrow
- `14.69` **Fingal** — offer branch to Morag for arrow
- `14.72` **Morag** — offer branch to Fingal for venison
- `15.44` **Morag** — give arrow to Fingal
- `16.15` **Morag** — offer branch to Ailsa for venison
- `17.57` **Morag** — offer arrow to Eachann for venison
- `20.03` **Coinneach** — give hide to Eachann

**Verbs refused:** {"Morag": {"accept": 26}, "Ailsa": {"accept": 11}} — an empty column means the verbs were never REACHED FOR, which is a different finding from being refused.

## What actually happened

471 deeds: **gather** 334 · **place** 71 · **give** 26 · **craft** 18 · **eat** 9 · **trade** 7 · **killed** 6

### Things that changed hands: 7

- ` 5.89` I traded wood to Ailsa for arrow
- ` 5.89` I got wood from Coinneach for arrow
- ` 5.93` I traded wood to Ailsa for arrow
- ` 5.93` I got wood from Coinneach for arrow
- ` 7.78` I got hide from Tormod for wood
- ` 7.82` I got hide from Tormod for wood
- ` 7.82` I traded hide to Morag for wood

## The talk

3240 distinct things said.

**Morag** 566 · **Fingal** 556 · **Coinneach** 473 · **Ailsa** 450 · **Tormod** 445 · **Eachann** 388 · **Seonaid** 362

### The last of it

```
23.70  Seonaid    Let us split this, Morag
23.70  Seonaid    Enough for all if we split it
23.70  Seonaid    Split the meat, no need for quarrel
23.70  Ailsa      just my share, then I'm gone
23.70  Fingal     meat for the pot
23.70  Fingal     that one's already down—mine now
23.70  Fingal     that venison's mine
23.70  Morag      Camp's set west of Broad Loch — bring meat, warm yourselves free.
23.70  Morag      Fire west of Broad Loch — wood's free, I take venison in trade.
23.70  Morag      Camp here north-west of Broad Loch — wood's free, bring meat and share it.
23.70  Eachann    that wounded one is mine now
23.70  Tormod     deer is mine, keep your branch
23.70  Tormod     that alert one's mine
23.70  Tormod     Ailsa later, deer first
23.70  Coinneach  Eachann, I owe you a hide
23.70  Coinneach  Owed you this.
23.70  Coinneach  I'll owe you for it, Eachann
23.70  Seonaid    Split it fair, we all starve else
23.70  Ailsa      almost there, Morag
23.70  Ailsa      coming to the fire, Morag
23.70  Fingal     Morag's got a fire going, I'm heading there now
23.70  Fingal     deer down there — I'm taking it
23.70  Fingal     stopping here tonight
23.75  Fingal     that meat is mine, I'm taking it
23.95  Eachann    that wounded one is mine now
```

