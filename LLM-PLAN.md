# Putting real minds in — the plan

The goal: a human joins a server, several LLM-driven players are already living
there on **different providers**, they hunt and forage and talk to each other and
to the human, and a watcher can read WHY each of them is doing what it does.

This document is the plan to get there. It is written to be executed in order.
**Read "What already exists" first** — most of the machinery is built and checked,
and the temptation to rebuild it is the main way this goes wrong.

---

## What already exists — do NOT rebuild any of this

| Capability | Where | Proof |
|---|---|---|
| Model-agnostic provider seam | `src/minds/providers.js` | `providercheck` 25/25 |
| Anthropic native provider | `AnthropicProvider` | " |
| **Every OpenAI-compatible vendor in one class** | `VENDORS` table | " |
| Per-agent model/persona roster | `MINDS_ROSTER=roster.json` | " |
| Personas, byte-identical when off | `PERSONAS=off\|on\|<list>` | `personacheck` 21/21 |
| Cost ceiling + per-agent cap | `Budget`, `AGENTS.maxCalls*` | " |
| Timeout + fallback-to-scripted | `ModelProvider.decide` | " |
| Narration into the chat column | `NARRATE=on` | `watchcheck` 10/10 |
| The board — one card per mind | `BOARD=on` → :8090 | `boardcheck` 35/35 |
| 16-player roster, measured | `MAX_PLAYERS` | `rostercheck` |
| **Agents hear each other AND the human** | `agent.js:322` → `heard` | — |
| **Agents speak onto the same wire** | `agent.js:853` → `C_CHAT` | — |
| The `{goal, why, where}` thread | `agent.js:872` `intentions` | `boardcheck` |

**The conversation loop is already closed.** Any chat message on the wire — from a
human or another agent — lands in `heard`, the last three go into the next brief,
and a `say` goal sends a sentence back out. Nothing needs inventing; it needs
*exercising*.

**Grok needs no new code.** `MINDS_PROVIDER=xai` is already in the vendor table and
speaks the OpenAI chat-completions shape. A key and a roster line is the whole
integration.

---

## The blocker, proven

**With a real Anthropic key today, every Claude call silently returns the
scripted brain's answer, and the header says the model is playing.**

Claude Opus 5 runs **adaptive thinking by default** — omitting the `thinking`
field no longer means "off" (that changed from Opus 4.8). So `content[0]` is a
*thinking* block, and `providers.js:299` reads:

```js
text: data?.content?.[0]?.text ?? ''
```

which yields `''` → `no json in reply` → `catch` → `fallback.decide(brief)`.

Driven against both response shapes, no key required:

```
text-first (what the code assumes)   -> kind="hunt"    failures=0  err=none
thinking-first (Opus 5 default)      -> kind="wander"  failures=1  err=no json in reply
```

`kind="wander"` is the **scripted** answer. Compounding it, `max_tokens: 120` is a
hard cap on thinking *plus* text on Opus 5 — even after fixing the block scan,
120 tokens will not reach the JSON with thinking on.

**This is the single most important thing in this document.** It fails in the
direction this project has been burned by five times: silently, in the direction
that flatters the change, with a green banner on top.

---

## Phase 1 — make one real call work  ✅ DONE (providercheck 33/33, counterfactual 32/33)

Small, mechanical, and everything else is downstream of it.

**1.1 Scan for the text block; never index `[0]`.**
```js
const text = (data?.content ?? []).filter((b) => b.type === 'text')
  .map((b) => b.text).join('').trim();
```
Also makes the parse robust to any provider that prepends blocks.

**1.2 Set the thinking posture explicitly. Do not leave it to a default.**
Recommended default — the call picks one verb and writes a short `why`:
```js
thinking: { type: 'disabled' },
output_config: { effort: 'low' },
max_tokens: 256,
```
*Rationale:* thinking tokens bill as **output** ($25/MTok on Opus 5). A reasoning
budget to choose between `hunt` and `goTo` is money spent on nothing a watcher
sees. The visible reasoning is the `why` field, which costs a dozen tokens.

**Two documented Opus-5 traps come with thinking disabled**, and both bite this
exact contract:
- it occasionally writes a **tool call as plain text** instead of a structured
  block — harmless here (we use no tools) but worth knowing;
- it can **leak `<thinking>` tags** into the visible response, which would break
  the JSON parse.

Mitigation, both from the model's own guidance: add *"Do not include internal or
system XML tags in your response"* to `systemPrompt()`, and **do not** add any
instruction telling it not to reason — that measurably makes leakage worse. The
existing `/\{[\s\S]*\}/` regex already tolerates surrounding prose, so a stray tag
outside the braces is survivable; one *inside* is not.

**1.3 Make thinking a flag, because it is an experiment axis.**
`MINDS_THINK=on` raises `max_tokens` to 1024 and switches to adaptive. Running
one agent with thinking and one without, same persona, is a genuinely interesting
thing to watch — and it is one line in the roster.

**1.4 Sampling parameters must stay absent.** `temperature`, `top_p`, `top_k` all
**400** on Opus 5 and Sonnet 5. The request body is currently clean — keep it that
way. Variety comes from personas and the seed, not from sampling.

**Proof:** extend `providercheck` with the thinking-first payload shape. It must
go red before 1.1 and green after. No key, no cost.

---

## Phase 2 — make failure visible  ✅ DONE (boardcheck 40/40; proved live in a browser — a card reading claude-opus-5 + SCRIPTED — 11/11 failed)

**The most important phase, and the one easiest to skip.** Phase 1 is worthless if
nobody can tell it worked.

Every failure path in `decide()` currently ends in `return this.fallback.decide()`.
That is the right *behaviour* — a mind that can stop the world is not a mind — but
it is invisible. `this.failures` and `this.lastError` are recorded and nothing a
human sees reads them.

**2.1 The header must print live truth, not configuration.** It already prints
`(no XAI_API_KEY)` for a missing key. Add, after the first minute of play:
`Eachann · claude-opus-5 · 47 calls, 0 failed` — or, in red,
`3 calls, 3 failed (no json in reply) — SCRIPTED`.

**2.2 The board grows a health line per card.** Model, calls, failures, last
error. The board already has four threads and a persona tag; this is a fifth
field, and `boardState` is pure so `boardcheck` can assert it from invented agents.

**2.3 A failure *rate* alarm.** If an agent's failure rate exceeds ~20% over its
last 20 calls, say so loudly in the chat column once. A model that has quietly
become the rules engine is the worst possible outcome for the evening and it
should be impossible not to notice.

**Proof:** `boardcheck` gains assertions for the health fields, including the
discriminating case — a card for an agent with failures must not render as healthy.

---

## Phase 3 — the mixed roster  ✅ DONE (providercheck 38/38; roster.example.json ships)

This is the payoff: several minds, several vendors, one hillside.

**3.1 `roster.json` is the whole configuration.** Already supported. Shape:

```json
[
  { "name": "Eachann", "provider": "anthropic", "model": "claude-opus-5",  "character": "..." },
  { "name": "Morag",   "provider": "anthropic", "model": "claude-sonnet-5","character": "..." },
  { "name": "Tormod",  "provider": "xai",       "model": "grok-4",         "character": "..." },
  { "name": "Iain",    "provider": "scripted" }
]
```

**Keys go in the environment, never in the file.** `ANTHROPIC_API_KEY`,
`XAI_API_KEY`. The roster names *who plays on what*; the environment says *who may*.

**3.2 Always seat one scripted player.** It is the control. When a model does
something startling, the scripted body next to it is the reference for whether
that was the model or the world.

**3.3 Model choice, with today's prices.**

| Model | $/MTok in | $/MTok out | Use for |
|---|---|---|---|
| `claude-opus-5` | $5 | $25 | The headliner; one or two seats |
| `claude-sonnet-5` | **$2** | **$10** | ← intro pricing **through 2026-08-31** |
| `grok-4` | (xAI's) | | The outside voice |
| `claude-haiku-4-5` | $1 | $5 | A cheap third Anthropic seat |

**Sonnet 5 is on introductory pricing right now** — roughly 2.5× cheaper than
Opus 5 for a job that is "pick a verb, write eight words of reason." A roster of
one Opus, two Sonnet, one Grok, one scripted is a better *watch* than four Opus
and costs a fraction.

**3.4 Large context is NOT needed — do not pay for it.** The brief is small:
self, a handful of contacts, `heard.slice(-3)`, a goal. Nothing in this game
approaches a context limit, and every model on the table has 200K+. If a model is
chosen for context length, that is money spent on a constraint we do not have.

---

## Phase 4 — the conversation, which is what a human actually watches  ✅ DONE (4.1 + 4.4 done, watchcheck 12/12; 4.2/4.3 still open — see below)

Behaviour is legible on the board. **Talk is the thing that makes it a story.**
Three specific limits stand between "some NPCs exist" and "watch three models
argue about a carcass":

**4.1 `heard.slice(-3)` is a three-message memory.** With six agents and a human
on one channel, three messages is less than one exchange — an agent will answer a
question that has already scrolled past. Widen to ~8 for the brief, keep the ring
at ~16. Cost: a few dozen tokens per call. This is the highest-value token spend
in the whole design.

**4.2 Measure the `say` gate before tuning it.** `AGENTS.speakEveryHours` is 0.4
**game** hours, and the game clock does not advance in real seconds — I have not
measured the conversion, so **measure it before changing it**. Print seconds
between utterances for a 10-minute run. Target: an agent speaks every 30–90 real
seconds when it has something to say. Too chatty is as bad as silent.

**4.3 Answering is not the same as announcing.** A `say` currently costs the
agent its turn — `this.goal = { kind: 'wander' }` after speaking. That is fine for
an unprompted remark and wrong for a reply: an agent asked "did you find the deer?"
should answer *and keep hunting*. Let a `say` carry an optional `then` verb, or
simply do not clear the goal when the agent is responding to something in `heard`.

**4.4 Give the mind an explicit social prompt.** The system prompt says "keep it
under fifteen words and in character." It does not say *when* to speak. Add:
speak when directly addressed, when you have found something others would want to
know, or when you disagree with what someone just said. Otherwise act. Models
under-reach for tools and conversation unless told the trigger condition — that
is a documented behaviour of the current Claude generation, and the fix is
prescriptive "say when…" language.

**Proof:** extend `watchcheck` — two agents, a scripted exchange injected on the
wire, assert that agent B's *next brief* contains agent A's sentence and that a
reply reaches the chat channel. That is the loop end-to-end and it needs no key
(the scripted provider can be told to answer).

---

## Phase 5 — cost, cadence and rate limits  ✅ DONE (5.1/5.2/5.3 done; 5.4 correctly skipped)

**5.1 The arithmetic to know before spending anything.** `AGENTS.cadenceSeconds`
is 6. Six model-backed agents = **60 calls/minute**. `maxCallsTotal` is 4000, so
the session budget is exhausted in ~67 minutes of play, after which everyone
silently reverts to scripted (by design, and a good design — but see Phase 2:
that reversion must be *loud*).

**5.2 Slow the minds down; the bodies do not slow with them.** This is the
architecture's best property and it is under-used: deliberation picks *what*,
reflex handles *how*. An agent that reconsiders every 12 seconds still hunts,
walks, aims and shoots at 30 Hz. **Recommend `cadenceSeconds` 10–12 for
model-backed agents**, which halves the bill and costs nothing a watcher can see.
Make it per-agent so one "twitchy" mind and one "ponderous" mind can share a
hillside.

**5.3 Handle 429 and 529 properly.** `if (!res.ok) throw` turns a rate limit into
a silent scripted fallback — indistinguishable from a boring model. Read the
`retry-after` header, back off, retry once, and only then fall back. At 60
calls/minute across two vendors this *will* happen.

**5.4 Skip prompt caching for now — it will not engage.** The minimum cacheable
prefix is 512 tokens on Opus 5 and 1024 on Sonnet 5; the system prompt is well
under both. Concurrent agents also miss by construction (an entry is not readable
until the first response begins streaming, and six agents fire together). Revisit
only if the system prompt grows past ~600 tokens, at which point it becomes the
single biggest cost lever available.

---

## Phase 6 — the dress rehearsal

**6.1 `livecheck` — the one check that costs money.** Explicitly opt-in
(`LIVE=1`), ~4 calls, and it asserts the thing no offline check can: that a goal
came from the **model** and not the fallback. Assert `provider.calls > 0 &&
provider.failures === 0` and that the returned verb is legal. Run it once per
provider before the evening. Everything else stays keyless.

**6.2 A twenty-minute full-roster rehearsal**, the real configuration, the day
before. Watch for: failure counters climbing, budget exhaustion timing, whether
agents talk *to* each other or merely *near* each other, and snapshot bandwidth
(the wire grows with the square of the roster — `rostercheck` before promising a
big house).

**6.3 The run command, for the record:**
```
DANGER=no-bears SCARCE=on node server/server.js 8080
MINDS_ROSTER=roster.json PERSONAS=on NARRATE=on BOARD=on npm run agents
npx vite --port 5173 --strictPort
```
Board on the second monitor. Chat column says *what*; the board says *why*.

---

## Decisions I have made, so nobody has to re-litigate them

| Decision | Why |
|---|---|
| Thinking **off** by default, flag to enable | Thinking bills as output; the visible reasoning is `why` |
| **Do not** add sampling parameters | 400s on Opus 5 / Sonnet 5; variety comes from personas |
| Keep fallback-to-scripted on every error | A mind that can stop the world is not a mind |
| ...but make the fallback **loud** | This project's entire failure history is silent success |
| One scripted seat, always | The control arm |
| Mixed model tiers, not all-Opus | Better watching, a fraction of the cost |
| No large-context model | The brief is small; it is not the constraint |
| No prompt caching yet | Prefix is under the cacheable minimum |

## What NOT to build

- **Collision** (players walk through each other and through trees). Queued in
  `STATE.md` item 2 with the evidence. Feature-sized, on the determinism surface,
  and unrelated to minds.
- **New rendering.** The board and chat column are built and checked.
- **A new provider class for Grok.** The OpenAI-compatible one already covers it.
- **Tool-calling / structured outputs.** The one-line-JSON contract works and is
  checked against a fake endpoint. Structured outputs would be *better* long-term
  (it removes the parse failure mode entirely) but it is not portable across
  vendors, and portability is the point of this seam.

---

## WHERE IT ACTUALLY STANDS — everything but the key

Phases 1-5 are built, checked and pushed. **The only thing between this and a
playable evening is a key**, and the two items below that need one.

**Still open, and both need a real key or a real clock:**

- **4.2 — the `say` gate is unmeasured.** `AGENTS.speakEveryHours` is 0.4 GAME
  hours and I did not measure what that is in real seconds, so I did not touch
  it. **Measure before tuning**: print the gap between utterances over a ten
  minute run and aim for one remark every 30-90 real seconds. Changing it blind
  is how a fleet ends up either silent or unreadable.
- **4.3 — a `say` still costs the agent its turn.** `agent.js` sets
  `this.goal = { kind: 'wander' }` after speaking, which is right for an
  unprompted remark and wrong for a reply: an agent asked "did you find the
  deer?" should answer AND keep hunting. Left alone deliberately — it is a
  behaviour change to the goal loop and it wants a live session to judge.
- **Phase 6 — the rehearsal and `livecheck`.** Cannot be built without a key;
  the shape is specified above.

**What to do first when the keys arrive**, in order, about twenty minutes:

1. `export ANTHROPIC_API_KEY=… XAI_API_KEY=…`
2. `cp roster.example.json roster.json`
3. Start a server, then
   `MINDS_ROSTER=roster.json PERSONAS=on NARRATE=on BOARD=on npm run agents`
4. **Read the board at :8090 before anything else.** Every card should show a
   green `N answered` tag. A red `SCRIPTED — n/n failed` means the key or the
   model string is wrong, and the tag carries the vendor's own error.
5. Watch the 15-second line for `FAILED` and the budget burn rate.

## Order of work, and why this order

1. **Phase 1** — nothing is testable until one real call returns a real verb.
2. **Phase 2** — because Phase 1 cannot be trusted without it. Do not defer this.
3. **Phase 4.1 + 4.4** — the two cheap conversation fixes; they change the watch
   more than anything else in this document.
4. **Phase 3** — the roster, once one provider is proven.
5. **Phase 5** — cadence and 429s, once there is real traffic to measure.
6. **Phase 6** — rehearsal.

Phases 1, 2 and 4 are roughly a day. Phase 3 is an hour plus keys.
