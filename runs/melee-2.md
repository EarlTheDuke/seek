# Melee run 2 — eight real minds, 2026-08-09

63 minutes of wall clock · game hour 7.5 → 10.4 · 175 samples

**Spend.** 592 calls of 4000 · 940,078 tokens in · 220,056 out · exhausted: False

## The seats

| who | model | answered | failed | share | decisions | gold | kills | carrying |
|---|---|--:|--:|--:|--:|--:|--:|---|
| Morag | `claude-opus-5` | 79 | 1 | 99% | 80 | 0 | 2 | 1 bow, 14 arrow, 4 hide, 3 wood |
| Eachann | `grok-4.20-0309-non-reasoning` | 141 | 0 | 100% | 141 | 0 | 1 | 1 bow, 41 arrow, 11 wood |
| Tormod | `grok-4.5` | 94 | 0 | 100% | 93 | 0 | 1 | 1 bow, 2 arrow, 2 hide, 2 wood |
| Coinneach | `kimi-k2.6` | 34 | 1 | 97% | 35 | 0 | 0 | 1 bow, 40 wood, 20 arrow, 2 hide |
| Seonaid | `kimi-k2.6` | 34 | 1 | 97% | 35 | 0 | 0 | 1 bow |
| Ailsa | `claude-sonnet-5` | 94 | 0 | 100% | 94 | 0 | 0 | 1 bow, 18 arrow, 9 wood |
| Fingal | `claude-haiku-4-5-20251001` | 113 | 0 | 100% | 113 | 0 | 2 | 1 bow, 3 hide, 5 wood |
| Iseabail | `SCRIPTED` | 0 | 0 | — | 141 | 0 | 2 | 1 bow, 2 hide |

A seat below ~80% answered is measuring the scripted fallback, not the model.

### What went wrong, per seat

- **Morag** — `no legal verb in reply`
- **Coinneach** — `reply cut off at 8000 tokens — raise maxTokens for this seat`
- **Seonaid** — `reply cut off at 8000 tokens — raise maxTokens for this seat`

## What they actually chose

215 decisions.

| n | share | goal |
|--:|--:|---|
| 52 | 24.2% | pick up what is lying about |
| 36 | 16.7% | make for Rowan Moor |
| 24 | 11.2% | hunt deer |
| 23 | 10.7% | hunt a deer |
| 16 | 7.4% | walk the country and see what is about |
| 14 | 6.5% | find shelter and settle for the night |
| 5 | 2.3% | make for the dead deer to the south-east |
| 3 | 1.4% | go toward deer |
| 3 | 1.4% | go toward Ailsa |
| 3 | 1.4% | stay still and watch |
| 3 | 1.4% | give branch to Morag |
| 3 | 1.4% | go toward Morag |
| 2 | 0.9% | stay with Ailsa |
| 2 | 0.9% | offer branch to Morag for venison |
| 2 | 0.9% | give branch to Seonaid |
| 2 | 0.9% | make for the deer to the east |
| 1 | 0.5% | stay with Fingal |
| 1 | 0.5% | go toward Cael |
| 1 | 0.5% | keep away from Fingal |
| 1 | 0.5% | go toward the wounded deer to the south-west |

**Social verbs: 13 of 215 = 6.0%.**
- ` 4.49` **Morag** — offer hide to Seonaid for venison
- ` 4.97` **Coinneach** — offer arrow to Ailsa for branch
- ` 6.55` **Ailsa** — give branch to Morag
- ` 6.79` **Seonaid** — give branch to Morag
- ` 8.49` **Tormod** — give branch to Morag
- ` 8.90` **Ailsa** — take Coinneach offer
- `13.01` **Seonaid** — offer branch to Morag for venison
- `14.10` **Ailsa** — offer branch to Morag for venison
- `17.86` **Ailsa** — give branch to Fingal
- `19.25` **Morag** — offer branch to Fingal for venison
- `20.13` **Morag** — give branch to Seonaid
- `21.62` **Ailsa** — give branch to Seonaid
- `21.90` **Tormod** — offer hide to Morag for venison

**Verbs refused:** none, by anybody — an empty column means the verbs were never REACHED FOR, which is a different finding from being refused.

## What actually happened

382 deeds: **gather** 294 · **place** 41 · **eat** 11 · **trade** 10 · **craft** 9 · **give** 9 · **killed** 8

### Things that changed hands: 10

- ` 9.03` I traded arrow to Ailsa for wood
- ` 9.03` I got arrow from Coinneach for wood
- ` 9.07` I traded arrow to Ailsa for wood
- ` 9.07` I got arrow from Coinneach for wood
- ` 9.11` I traded arrow to Ailsa for wood
- ` 9.11` I got arrow from Coinneach for wood
- ` 9.15` I traded arrow to Ailsa for wood
- ` 9.15` I got arrow from Coinneach for wood
- ` 9.19` I traded arrow to Ailsa for wood
- ` 9.19` I got arrow from Coinneach for wood

## The talk

2990 distinct things said.

**Fingal** 525 · **Morag** 515 · **Seonaid** 469 · **Coinneach** 452 · **Ailsa** 422 · **Eachann** 319 · **Tormod** 288

### The last of it

```
23.90  Ailsa      coming in with five branches, need that fire
23.90  Ailsa      Fingal, with me, fire's south at Rowan Moor
23.90  Fingal     branches, where are you
23.90  Fingal     wait up—I'm with you
23.90  Fingal     come on, fire's waiting
23.90  Morag      Venison's south-west here — I'm hauling it to Rowan Moor fire, shares for wood or hide.
23.90  Morag      Three goblins north-east — Cael's dead. Come south to the fire, don't go up there alone.
23.90  Morag      Taking the near deer south-east — I'll cook and share at the fire, wood or hide a share.
23.90  Eachann    more wood here for the fire
23.90  Eachann    venison here for the fire
23.90  Tormod     hide for my venison share, fair deal
23.90  Tormod     hide for venison, fair as I said
23.90  Tormod     hide for your share, deal?
23.90  Coinneach  Arrow for your branch
23.90  Coinneach  One arrow. One branch.
23.90  Coinneach  taking that meat to the fire
23.90  Seonaid    I come to split it fair
23.90  Seonaid    I will carve it fair for all
23.90  Seonaid    I come to split it fair for all
23.90  Ailsa      holding at the fire, still trading wood for meat
23.90  Ailsa      heading to the fire, keeping clear of the goblins
23.90  Ailsa      still coming, wood for meat if anyone's sharing
23.90  Fingal     I have the branches—where is that venison?
23.90  Fingal     going for that venison east
23.90  Fingal     coming for you now
```

