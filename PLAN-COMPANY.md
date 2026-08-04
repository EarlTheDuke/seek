# Plan — a company: other players, with minds, who fight alongside you

Asked for: another player that coordinates with the human (or the computer-use
tester) to do things like kill a troll. Alone or together.

The honest headline is that **most of this already exists**, and the shape of the
work is much smaller than "add multiplayer AI". What is missing is a way for you
to talk, a reason for them to listen, and a fight that can be finished.

---

## What already works today

Verified by reading, not assumed:

| thing | where | state |
|---|---|---|
| Authoritative server, 8 player slots | `server/server.js` | works |
| Browser joins a server | `?join=ws://127.0.0.1:8080&name=Ben` | works |
| Agents are real socket clients | `src/net/agent.js` | works |
| Agents run on a model, key-gated | `src/minds/providers.js` | works |
| **Agents HEAR chat** | `agent.js:147`, into `brief().heard` | works |
| Agents can speak | goal `say` → `C_CHAT` | works |
| Shared budget, hard call cap | `Budget` in providers.js | works |
| Agents have hands (gather) | landed 2026-08-03 | works |

So: you can already stand in the same world as a model-driven player, and it can
already hear what is said. That is the expensive half and it is done.

## The four gaps

1. **You cannot type.** The browser receives chat (`onChat` → toast) and has no
   way to send it. The coordination channel exists and is one-way.
2. **No standing orders.** The goal vocabulary is nine verbs, all one-shot.
   Nothing means "stay with me" or "keep shooting that".
3. **Agents cannot fight.** `hunt` walks at the target and holds the mouse. That
   is suicide against a troll, and barely works on a deer.
4. **The troll fight cannot be finished by anyone.** See FINDINGS 2026-08-03
   21:00: a wounded creature that drifts past 400 m is removed from the world
   WITH ITS WOUNDS. No amount of coordination beats that.

---

## Phase 1 — let the human speak  (small)

A chat input in the browser: `T` or `Enter` opens a line, typing sends `C_CHAT`.
The HUD's notes box already does the "panel that owns the keyboard" pattern, so
this is mostly a copy of that.

**Unlocks:** you can say "go left" and a model-driven agent will see it in its
next brief. Nothing else needed for the loop to close, because the listening half
already works.

**Ship this alone and it is already useful** — it makes the existing agents
directable, and it is the smallest change with the largest jump in capability.

## Phase 2 — standing orders  (medium)

Add verbs that persist rather than fire once:

- `follow <name>` — stay within N metres of a named player, the only verb that
  makes a party a party.
- `guard <name>` — follow, and engage anything that attacks them.
- `hold ground` — stop advancing, keep shooting. Already half-there as `hold`.

These are goals, so they go in `src/minds/goals.js` and the reflex layer in
`agent.js:resolve()` carries them out. The constrained-output safety property is
unchanged: a closed table, three rows longer.

**Design note worth keeping:** do NOT let the human issue commands directly into
an agent's goal. Say it out loud and let the mind decide whether to obey. That
keeps the honesty rule — a mind acts on what it perceives — and it means a
distracted or frightened agent can reasonably ignore you, which is better
company than a remote-controlled drone.

## Phase 3 — combat competence  (the real work)

Currently `hunt` = walk at it, hold primary. Against a troll: charge 7.2 m/s,
62 damage a hit, two hits kills. An agent will die every time.

The reflex layer needs, roughly:

- **Range discipline.** Hold at bow range; back off if the target closes inside
  ~25 m, without turning your back.
- **Draw and loose properly.** Stand still for the 0.92 s draw, then move. The
  agent currently holds the button while walking, which is the worst of both.
- **Retreat below a health threshold**, and say so — "I am hurt" is the most
  useful sentence a companion can produce.
- **Focus fire.** If a party member is shooting X, shoot X. This is what makes
  three players beat a troll that one cannot.

This is the phase that makes companions feel like people rather than tourists,
and it is most of the effort.

## Phase 4 — make the troll killable  (small, but blocking)

From FINDINGS: 420 HP, 62 damage, aggro 150, leash 300, despawn 400. Five clean
headshots to kill; two hits to die. Fight at range and it disengages, wanders
past 400 m and is deleted, healed. Fight close and you die.

**The fix is one rule: a creature the player has damaged does not despawn.**
Persist it, or persist its HP against its site key. Everything else here is
tuning; that is the difference between a hard fight and an impossible one.

Do this BEFORE phase 3, or the first thing a working combat AI proves is that
the fight is unwinnable.

---

## Suggested order

    4  →  1  →  2  →  3

Phase 4 first because it is small and everything downstream is meaningless
without it. Then phase 1, because it is tiny and immediately changes what the
existing agents can do. Then 2, then 3.

Phases 1 and 4 together are probably an afternoon and would already give you:
a model-driven player in your world, that hears you, that you can direct by
talking, against creatures whose wounds stick.

## Running it

    npm run serve                       the world
    ?join=ws://127.0.0.1:8080&name=Ben  you, in a browser
    npm run agents -- 2                 two companions, scripted, free

    MINDS_PROVIDER=claude MINDS_API_KEY=sk-... npm run agents -- 2

Model-driven costs real tokens. The `Budget` class already caps the whole
session and each agent separately, and running out falls back to the scripted
brain rather than stalling — so the floor is "the game still works", which is
what VISION.md requires.

## What NOT to build

- **Do not give agents privileged information.** They get senses, not world
  state. A companion that always knows where the troll is stops being a
  character.
- **Do not let the browser hold an API key.** VISION.md is explicit: clients
  never call out. Minds live server-side or in the agent process.
- **Do not make them obedient.** See the design note in phase 2.
