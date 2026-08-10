# Tomorrow's big projects — what already exists

Written the night before, from reading the code rather than guessing, so the
morning does not start with reconnaissance.

Ben's three: **a PvP mode where agents fight for a win** (king of the hill,
tribe teams, or both), and **pets as a switch**. Plus the standing rule that
none of it may break what is working now.

---

## The good news: far more is built than it looks

### Parties are real already

`Player.party` exists, rides on the wire as `g`, and the world already knows
what it means:

```js
if (a.party && a.party === b.party) return false;   // never hurt each other
if (!this.rules.pvp) return false;
```

So **tribes are not a new system.** They are a matter of assigning `party` from
the roster and letting the existing rules do the rest. Friendly fire is already
prevented, the client already receives the tag, and `avatars.js` has a comment
saying it is sent "so a client can draw its own people differently" — which is
the team colour, unbuilt but anticipated.

### PvP is already gated, and thoughtfully

`pvpAllowed` turns on above `SOCIAL.pvpAboveStrangeness` (0.45) — the settled
country is safe and the wild country is not, so violence has a GEOGRAPHY rather
than a checkbox. There is also `pvpEverywhere` for a straight brawl.

That gradient is worth keeping in any PvP mode. "Fight over there, not here" is
a better rule than "fighting on" and it already produces a map.

### Pets are one environment variable from being a switch

`PET=wolfcub npm run agents` gives every agent one; a roster line can override
per seat. What is missing is only the OFF side being explicit and the launchers
exposing it. Nearly free.

---

## What is genuinely missing

### 1. A win condition, and something that ends
Nothing in this game ends. Every mode Ben named needs a **score** and a
**finish** — and the board needs to show both, or the agents are playing for
something only the log can see.

### 2. Somewhere to stand — king of the hill
There is no concept of a place worth holding. `nearbyDistricts` and the
landmarks give you named ground for free; a hill is a landmark plus a radius
plus "who is standing in it".

### 3. Telling a mind it is on a team, and what winning is
The biggest one, and the lesson of this entire week: **a mind cannot decide
about something nobody has told it.** The brief needs the party, the score, the
time left, and who is on the hill — stated as plainly as the standing offer and
the claimed target now are. Without that, agents will play the survival game
they can see and ignore the match they cannot.

### 4. Gold as the score
See `TODO.md` Tier 2.75. Gold has producers and no consumers, so it is currently
a souvenir. Making it what you are playing FOR costs nothing to build — the
drops exist — and turns every goblin into a reason to fight.

---

## What must not break

The check suite is the guard. **50+ files, all green tonight**, and the ones
that matter most to this work:

| | |
|---|---|
| `duelcheck` | PvP damage and the strangeness gate |
| `raidcheck` | party behaviour under attack |
| `companioncheck` | 45 assertions on pets — the switch must not disturb them |
| `honestcheck` (27) | every refusal still says why |
| `carrycheck`, `packcheck` | the server still owns the pack |
| `personacheck` | the prompt is byte-identical at default |

A mode that changes the default game is a mode that invalidates every run in
`runs/`. **Every new mode should be OFF by default and byte-identical when off**
— the same rule the persona experiment follows, for the same reason.

---

## A suggested order

1. **Pets on/off**, because it is nearly done and it is a warm-up that proves
   the flag discipline.
2. **Teams from the roster** — assign `party`, colour the avatars, and watch a
   normal survival hour with tribes in it. Changes nothing else.
3. **A hill worth holding**, with score and clock on the board.
4. **Tell the minds about it**, which is where it becomes a game rather than a
   scoreboard over a survival sim.

Do 2 before 3. A tribe run that changes nothing but who will not shoot whom is
already an interesting hour, and it de-risks everything after it.
