# Melee run 3 — priced trade and a visible offer, 2026-08-09

40 minutes of wall clock · game hour 7.5 → 20.1 · 120 samples

**Spend.** 394 calls of 4000 · 650,399 tokens in · 137,268 out · exhausted: False

## The seats

| who | model | answered | failed | share | decisions | gold | kills | carrying |
|---|---|--:|--:|--:|--:|--:|--:|---|
| Morag | `claude-opus-5` | 53 | 0 | 100% | 53 | 0 | 2 | 1 bow, 9 arrow, 5 hide, 18 wood |
| Eachann | `grok-4.20-0309-non-reasoning` | 94 | 0 | 100% | 94 | 0 | 2 | 1 bow, 4 hide, 2 wood, 1 venison_cooked |
| Tormod | `grok-4.5` | 62 | 0 | 100% | 62 | 0 | 1 | 1 bow, 5 wood |
| Coinneach | `kimi-k2.6` | 24 | 0 | 100% | 24 | 0 | 0 | 1 bow, 12 arrow, 8 wood |
| Seonaid | `kimi-k2.6` | 23 | 1 | 96% | 24 | 0 | 1 | 1 bow, 6 wood |
| Ailsa | `claude-sonnet-5` | 62 | 0 | 100% | 62 | 0 | 0 | 1 bow |
| Fingal | `claude-haiku-4-5-20251001` | 75 | 0 | 100% | 75 | 0 | 1 | 1 bow, 2 hide, 12 wood |
| Iseabail | `SCRIPTED` | 0 | 0 | — | 94 | 0 | 1 | 1 bow, 12 wood |

A seat below ~80% answered is measuring the scripted fallback, not the model.

### What went wrong, per seat

- **Seonaid** — `This operation was aborted`

## What they actually chose

150 decisions.

| n | share | goal |
|--:|--:|---|
| 37 | 24.7% | pick up what is lying about |
| 22 | 14.7% | hunt deer |
| 17 | 11.3% | hunt a deer |
| 15 | 10.0% | walk the country and see what is about |
| 11 | 7.3% | make for Rowan Moor |
| 5 | 3.3% | offer branch to Morag for cooked venison |
| 5 | 3.3% | give branch to Morag |
| 4 | 2.7% | stay still and watch |
| 3 | 2.0% | find shelter and settle for the night |
| 2 | 1.3% | take Tormod offer |
| 2 | 1.3% | go toward Morag |
| 1 | 0.7% | go toward deer |
| 1 | 0.7% | offer branch to Eachann for venison |
| 1 | 0.7% | go toward the deer south-east |
| 1 | 0.7% | hunt the alert deer to the east |
| 1 | 0.7% | hunt deer to the east |
| 1 | 0.7% | give branch to Eachann |
| 1 | 0.7% | go toward west deer |
| 1 | 0.7% | make for the dead deer to south-east |
| 1 | 0.7% | go toward the dead deer to the south-east |

**Social verbs: 16 of 150 = 10.7%.**
- ` 2.28` **Tormod** — offer branch to Morag for cooked venison
- ` 3.46` **Ailsa** — give branch to Morag
- ` 4.66` **Coinneach** — offer branch to Morag for cooked venison
- ` 8.75` **Ailsa** — give branch to Morag
- `12.22` **Ailsa** — offer branch to Morag for venison_cooked
- `12.80` **Tormod** — offer branch to Eachann for venison
- `12.87` **Ailsa** — give branch to Morag
- `13.72` **Eachann** — take Tormod offer
- `14.66` **Tormod** — give branch to Eachann
- `16.67` **Morag** — take Tormod offer
- `17.04` **Seonaid** — offer branch to Morag for cooked venison
- `17.16` **Ailsa** — give branch to Morag
- `19.12` **Seonaid** — give branch to Morag
- `22.00` **Tormod** — take Eachann offer
- `22.96` **Seonaid** — offer branch to Morag for cooked venison
- `23.15` **Ailsa** — offer branch to Morag for cooked venison

**Verbs refused:** none, by anybody — an empty column means the verbs were never REACHED FOR, which is a different finding from being refused.

## What actually happened

275 deeds: **gather** 199 · **place** 30 · **give** 23 · **killed** 8 · **eat** 8 · **craft** 5 · **trade** 2

### Things that changed hands: 2

- `18.56` I got wood from Tormod for venison_cooked
- `18.56` I traded wood to Morag for venison_cooked

## The talk

2166 distinct things said.

**Fingal** 371 · **Morag** 360 · **Ailsa** 321 · **Coinneach** 314 · **Tormod** 283 · **Eachann** 267 · **Seonaid** 250

### The last of it

```
23.50  Ailsa      branches ready, cooked venison for one?
23.50  Fingal     that kill is still mine
23.50  Fingal     coming for my kill now
23.50  Fingal     going round the wanderer
23.68  Morag      Venison's down south-west — bring branches to Rowan Moor, I cook shares.
23.77  Ailsa      gathering wood, then meat for me too
23.80  Morag      South-west deer, going now. Wood to Rowan Moor and I cook shares tonight.
23.80  Morag      South-west deer now — bring wood to Rowan Moor, I'll cook shares.
23.80  Morag      Venison's down south-west — bring branches to Rowan Moor, I cook shares.
23.80  Eachann    fine, here's your venison
23.80  Tormod     meat as agreed, hand it over
23.80  Tormod     aye hand it over
23.80  Tormod     aye, hand it over
23.80  Coinneach  forty-six branches, feed me
23.80  Coinneach  twenty-eight branches here, who has meat to sell
23.80  Coinneach  Morag, eight branches for a share of that deer
23.80  Seonaid    Morag, I brought branches for the fire
23.80  Seonaid    I bring wood for a share
23.80  Seonaid    Wood for your fire, Morag — a warm share for me?
23.80  Ailsa      still heading in, branches ready to trade
23.80  Ailsa      branches ready, cooked venison for one?
23.80  Ailsa      gathering wood, then meat for me too
23.80  Fingal     that kill is still mine
23.80  Fingal     coming for my kill now
23.80  Fingal     going round the wanderer
```

