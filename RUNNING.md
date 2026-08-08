# How to run this again

Everything below assumes you are standing in this folder with the file
explorer, not a terminal. There are three files you ever need to touch.

---

## The short version

1. **Right-click `keys.cmd` → Edit.** Paste your API keys between the quotes.
   Save. (Right-click → Edit, **not** double-click — double-clicking runs it.)
2. **Double-click `CHECK-KEYS.cmd`.** It tells you, per player, whether they
   will actually think. Fix anything red. Costs nothing and sends no prompts.
3. **Double-click `PLAY.cmd`.** Three black windows open, then the game and the
   mind-board in your browser.
4. **Double-click `STOP.cmd`** when you are done. That is what stops the money.

Everything else in this file is detail you only need when something is wrong.

---

## The files

| File | What it is |
|---|---|
| `keys.cmd` | **Your API keys.** Gitignored — never committed, never leaves this machine. The only file with secrets in it. |
| `roster.json` | **Who is playing**: name, model, character, how often each thinks. The mixed six-model roster. |
| `roster-kimi.json` | An all-Kimi roster — four minds on your own box, costs nothing. |
| `PLAY.cmd` | Starts everything and opens the browser. |
| `PLAY-KIMI.cmd` | Same, but the free all-Kimi roster. |
| `CHECK-KEYS.cmd` | Proves every key and every model name before you start. |
| `STOP.cmd` | Stops everything. |

## The two browser tabs

```
http://localhost:5173/?join=ws://127.0.0.1:8080&name=Ben&danger=no-bears&solid=on
http://127.0.0.1:8090
```

The first is the game. The second is the **board** — one card per mind showing
what it is doing and *why*. Put the board on the second monitor; the chat column
tells you what, only the board tells you why.

**Read the black window titled "MINDS" first.** It prints one line per player
naming the model actually behind them. `(no ANTHROPIC_API_KEY)` beside a name
means that key did not take and the player is running scripted. Nothing else on
screen tells you the difference.

---

## Who is on the roster, and what each seat costs

Measured over 381 decisions on 2026-08-07.

| Seat | Model | Thinks every | $/1000 decisions |
|---|---|---|---|
| Eachann | `grok-4.20-0309-non-reasoning` | 12 s | **$0.79** — 0.8 s to answer |
| Fingal | `claude-haiku-4-5-20251001` | 20 s | ~$1.10 |
| Morag | `claude-sonnet-5` | 25 s | ~$2.10 |
| Tormod | `grok-4.5` | 30 s | $1.41 |
| Ailsa | `claude-sonnet-5` | 40 s | ~$2.10 |
| Coinneach | `kimi-k2.6` (your tinybox) | 90 s | **free** |
| Iseabail | none — **scripted control** | — | free |

**About $2 an hour** for the whole table. `budgetCalls: 3000` in `roster.json` is
a hard stop at roughly five hours.

**Iseabail must stay scripted.** She is the control: when a model does something
startling, she is how you tell whether that was the model or just the world. She
has out-performed every model twice now, which is the single most useful number
this project has produced.

---

## What a mind can actually DO

The verb list is closed — a model cannot invent an action, so this is the whole
of what any of them can choose. Six of these are new as of 2026-08-07 and none
of them had ever been exercised in a live run when this was written.

| verb | takes | notes |
|---|---|---|
| `hunt` | quarry | matched loosely now — "deer", "a deer", "deer to the north" all work |
| `attack` | target | a PERSON. The world still decides whether it lands |
| `give` | target, item | walks to them and hands one thing over. Item optional |
| `offer` | target, item, want | a price, said out loud. Everybody hears it |
| `accept` | target | takes the offer that person made you |
| `say` | text | one line, capped |
| `goTo` `approach` `avoid` | place / target | |
| `gather` `makeCamp` `hold` `wander` | — | |
| `follow` `guard` | target | standing orders — they persist |

**Gold** drops off goblins (0–3) and trolls (8–20), never off deer. It cannot be
eaten, burned or shot: it is worth exactly what somebody will trade for it, and
whether six models will agree on that is the open experiment.

**PvP** is on and is not a toggle: party members never harm each other, and
between strangers it depends on where you are standing — off in the settled
country round the lake, on out in the strange country. `PVP_EVERYWHERE=on` in
`PLAY.cmd` for a brawl anywhere, including at the spawn.

## Knobs worth knowing

Set these in `PLAY.cmd` (they are plain lines near the top).

| | |
|---|---|
| `SOLID=on` | Bodies stop walking through trees, rocks and each other. On by default now. |
| `DANGER=no-bears` | Goblins and trolls yes, bears no. `full` for everything, `none` for nothing. |
| `PERSONAS=on` | Characters from `roster.json`. `off` gives every mind the identical prompt — that is the control condition for any personality experiment. |
| `NARRATE=on` | Each mind says what it is doing in the chat column. |
| `HUNGER=52` | Everybody starts hungry. **Recommended** — see the findings. |
| `SCARCE=on` | A lean valley. Character only shows when something is at stake. **Note:** with the ten-branch fire this is now genuinely hard — one scripted body in six died overnight in testing. |
| `MEMORY=flat` | **The control arm.** One memory ring, recency only — how this worked before 2026-08-08. Default is the two-stream version. Run both arms to measure what memory scaffolding is worth. |

---

## What a mind is given each decision

Rebuilt 2026-08-08 after the measurement that a memory here had a **half-life of
exactly one decision**. Full reasoning in
[WHAT-A-MIND-IS-GIVEN.md](WHAT-A-MIND-IS-GIVEN.md).

| in the brief | what it is |
|---|---|
| place, hour, light, weather, wind | where and when |
| health, hunger, cold | its own body, in words |
| **carrying** | the pack |
| **lacking** | *and what it has run out of* — "no arrows, you cannot shoot". Absence from a list is not a fact a model reliably notices; one mind hunted for an hour on an empty bow. |
| **since your last decision** | **what its own last action did.** "You laid a fire." "Your shot was refused — no clear line." "You said that already." Placed above the world, because everything below reads the same whether the last decision achieved anything. |
| contacts | up to six things it can see within 140 m, with bearing, distance, what they are doing, and whether there is a clear shot |
| heard, shotBy | the last eight lines of chat; who shot it |
| **also out there** | **name and bearing for everyone on the roster, at any range.** Past 140 m the other player used to vanish from the prompt entirely, and every social verb takes a target that can only be named from it. |
| **things on the ground** | dropped loot — carcasses, what people threw down — within 260 m. `gather venison` walks you to a kill; `makeCamp` still means firewood. |
| **memory** | **two streams.** Sightings in one ring, things that *happened* in another, and sightings can no longer evict a trade. Events are retrieved by `importance × recency` off a weight table — being shot 9, a trade 8, a kill 7, a sighting 1. |
| **plan** | up to three lines the mind writes for itself, carried forward |
| **note** | one page of its own — a grudge, a price, a promise |

**Two fields a mind writes and nobody else reads: `plan` and `note`.** They show
on the board in their own colour. Everything else on a card is what the mind did
or what the world did to it; those two are the only things it authored.

**Speech is no longer a verb.** `say` rides along on any decision —
`{"kind":"hunt","quarry":"deer","say":"that one is mine"}` — so talking costs
nothing. It used to be a `kind`, which meant speaking instead of acting, and
across two days and six models this world produced one sentence between them.

**Per-seat knobs** live in `roster.json`: `cadenceSeconds`, `timeoutSeconds`,
`maxTokens`, `think`, `effort`, `character`.

---

## When something is wrong

**"They are all scripted."** A key did not take. Run `CHECK-KEYS.cmd`. Usually a
space around the `=` or a missing quote.

**"It says BAD MODEL NAME."** The key is fine; the model string is not.
`CHECK-KEYS.cmd` prints the exact names that provider will accept — paste one
into `roster.json`.

**"Nothing happens / it connects to the wrong world."** A server from an earlier
session is still on port 8080. `PLAY.cmd` detects this and offers to close it —
say yes. This is the single most confusing failure mode there is: the new server
dies silently and everything joins the old one, which has none of tonight's
settings.

**"One player keeps failing."** Look at the board. `This operation was aborted`
is a timeout — raise that seat's `timeoutSeconds`. `no json in reply` on a
reasoning model means it spent the whole budget thinking — raise `maxTokens`,
and slow its `cadenceSeconds` so it is not asked again before it has answered.

**Kimi specifically:** it always reasons — fourteen ways of asking it not to were
tried and all were ignored. It needs `maxTokens: 3000` and 60–90 s between
questions. It is still the least reliable seat, at about 3 answers in 8.

---

## Where the data goes

- **`/board.json`** on port 8090 — live JSON: every mind's goal, reason, deeds,
  speech, arrows, kills, token spend. This is what the analyses were built from.
- **`DEV-NOTES.md`** — a written report per run, including a "what nobody ever
  did" section. Only written when the agents process exits **cleanly**; killing
  the window skips it.
- **`SESSION.log`** — the browser client's flight recorder, including every chat
  line it heard.

Both are gitignored working material.
