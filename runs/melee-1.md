# Melee run 1 — seven minds and a control, 2026-08-09

73 minutes of wall clock · game hour 7.8 → 3.6 · 221 samples

**Spend.** 800 calls of 4000 · 1,052,167 tokens in · 283,454 out · exhausted: False

## The seats

| who | model | answered | failed | share | decisions | gold | kills | carrying |
|---|---|--:|--:|--:|--:|--:|--:|---|
| Morag | `claude-opus-5` | 108 | 0 | 100% | 108 | 0 | 2 | 1 bow, 9 arrow, 40 wood, 7 hide, 3 venison_cooked |
| Eachann | `grok-4.20-0309-non-reasoning` | 189 | 0 | 100% | 189 | 0 | 0 | 1 bow, 2 hide, 60 wood, 14 arrow |
| Tormod | `grok-4.5` | 126 | 0 | 100% | 125 | 0 | 4 | 1 bow |
| Coinneach | `kimi-k2.6` | 27 | 23 | 54% | 49 | 0 | 0 | 1 bow, 9 wood |
| Seonaid | `kimi-k2.6` | 13 | 37 | 26% | 49 | 0 | 1 | 1 bow, 4 wood |
| Ailsa | `claude-sonnet-5` | 126 | 0 | 100% | 126 | 0 | 0 | 1 bow, 12 arrow, 1 wood |
| Fingal | `claude-haiku-4-5-20251001` | 0 | 151 | 0% | 151 | 0 | 0 | 1 bow, 2 wood |
| Iseabail | `SCRIPTED` | 0 | 0 | — | 189 | 0 | 1 | 1 bow, 1 hide, 6 wood |

A seat below ~80% answered is measuring the scripted fallback, not the model.

### What went wrong, per seat

- **Coinneach** — `no json in reply`
- **Seonaid** — `no json in reply`
- **Fingal** — `http 400 — {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support the effort parameter."},"request_id":"req_01`

## What they actually chose

341 decisions.

| n | share | goal |
|--:|--:|---|
| 79 | 23.2% | pick up what is lying about |
| 65 | 19.1% | hunt a deer |
| 46 | 13.5% | walk the country and see what is about |
| 32 | 9.4% | find shelter and settle for the night |
| 22 | 6.5% | hunt deer |
| 16 | 4.7% | make for Heather Scaur |
| 12 | 3.5% | make for Broad Loch |
| 9 | 2.6% | make for Rowan Moor |
| 8 | 2.3% | go toward Morag |
| 6 | 1.8% | stay still and watch |
| 4 | 1.2% | go toward deer |
| 4 | 1.2% | keep away from a goblin |
| 4 | 1.2% | give branch to Morag |
| 4 | 1.2% | offer branch to Morag for venison |
| 3 | 0.9% | keep away from goblin |
| 3 | 0.9% | offer branch to Morag for cooked venison |
| 2 | 0.6% | take Morag offer |
| 2 | 0.6% | make for the deer |
| 2 | 0.6% | make for Morag |
| 2 | 0.6% | make for west of Rowan Moor |

**Social verbs: 24 of 341 = 7.0%.**
- ` 7.43` **Morag** — offer cooked venison to Ailsa for branch
- ` 7.97` **Ailsa** — offer branch to Morag for cooked venison
- ` 8.94` **Ailsa** — take Morag offer
- ` 9.21` **Tormod** — offer branch to Morag for cooked venison
- ` 9.46` **Tormod** — offer 3 branches to Morag for 2 cooked venison
- ` 9.89` **Ailsa** — give branch to Morag
- ` 9.95` **Tormod** — give branch to Morag
- `10.22` **Morag** — take Ailsa offer
- `11.31` **Ailsa** — give branch to Morag
- `11.81` **Ailsa** — take Tormod offer
- `12.28` **Ailsa** — give branch to Tormod
- `14.31` **Tormod** — offer branch to Morag for venison
- `15.01` **Coinneach** — offer branch to Morag for cooked venison
- `15.59` **Ailsa** — offer branch to Coinneach for cooked venison
- `15.77` **Morag** — offer cooked venison to Tormod for twelve branches
- `16.13` **Tormod** — take Morag offer
- `16.33` **Morag** — offer cooked venison to Tormod for branch
- `17.07` **Ailsa** — offer branch to Morag for venison
- `17.43` **Tormod** — give branch to Morag
- `18.55` **Morag** — offer 6 hides to Ailsa for venison
- `18.70` **Ailsa** — offer branch to Morag for venison
- `18.89` **Ailsa** — offer branch to Coinneach for venison
- `19.14` **Morag** — offer hide to Ailsa for venison
- `23.20` **Seonaid** — offer branch to Morag for venison

**Verbs refused:** {"Morag": {"offer": 17}, "Ailsa": {"avoid": 24}} — an empty column means the verbs were never REACHED FOR, which is a different finding from being refused.

## What actually happened

631 deeds: **gather** 470 · **place** 89 · **give** 30 · **craft** 13 · **eat** 11 · **trade** 10 · **killed** 8

### Things that changed hands: 10

- ` 8.96` I traded venison_cooked to Ailsa for wood
- ` 8.96` I got venison_cooked from Morag for wood
- ` 9.48` I traded venison_cooked to Ailsa for wood
- ` 9.48` I got venison_cooked from Morag for wood
- `10.40` I got wood from Ailsa for venison_cooked
- `10.40` I traded wood to Morag for venison_cooked
- `16.36` I traded venison_cooked to Tormod for wood
- `16.36` I got venison_cooked from Morag for wood
- `16.41` I traded venison_cooked to Tormod for wood
- `16.41` I got venison_cooked from Morag for wood

## The talk

3312 distinct things said.

**Morag** 690 · **Ailsa** 653 · **Tormod** 581 · **Coinneach** 507 · **Eachann** 466 · **Seonaid** 415

### The last of it

```
23.90  Coinneach  I need meat and fire. I have branches.
23.90  Coinneach  Morag — save me some venison. I pay in branches.
23.90  Coinneach  ten branches for cooked venison, Morag
23.90  Seonaid    bringing wood for the fire
23.90  Seonaid    bringing wood to your fire, Morag
23.90  Seonaid    Morag, branches for a cut of that deer
23.90  Ailsa      I'll wait by the loch, safe from any troll.
23.90  Ailsa      I'll just gather here, safe from that troll business.
23.90  Ailsa      Goblins coming - I'm staying clear!
23.90  Morag      Closing on the deer west — Ailsa, come round its far side and push it to me.
23.90  Morag      Closing to short range — Ailsa hold its far side, we camp here after with my branches.
23.90  Morag      My deer — I'll take meat, then I've branches enough for a fire here tonight. Goblin north, stay sout
23.90  Eachann    coming to help haul it Morag
23.90  Eachann    that one is mine
23.90  Tormod     south-east deer still mine
23.90  Tormod     I'll help haul, claim my share
23.90  Tormod     still coming to haul
23.90  Coinneach  I'll butcher my own thanks
23.90  Coinneach  I need those arrows and meat. I'll owe you.
23.90  Coinneach  Morag, I need arrows and meat. Branches to trade.
23.90  Seonaid    split it fair, I'll carry my share
23.90  Ailsa      coming round to help haul, Morag
23.90  Ailsa      coming round now, Morag
23.90  Ailsa      here now, let's haul this meat
23.95  Eachann    coming to the fire
```

