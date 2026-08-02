# Seek — high-level plan

> A hunter in a land where the old things are waking.
>
> You start in green lowlands with a bow and a day's light. The further you go
> from the water, the less the world obeys ordinary rules.

This is the destination document. [README.md](README.md) describes what exists
today; this describes where it goes and in what order. Every phase below ends
with something a person can *play*, not just something that compiles.

---

## 1. What the game is

**A survival hunting game in a folkloric world, playable alone or with a few
friends on a machine one of you owns.**

Three sentences of pitch:

- You hunt to eat, and the hunt is a stalk — wind, cover, patience, one good
  arrow. That already works and it is the best thing here.
- The land is not empty and not safe. Bears now; goblins, trolls and stranger
  things later, concentrated in the places that are hardest to reach.
- You will be cold, you will be hungry, and eventually you will build somewhere
  to be neither.

### The setting, and why it isn't generic fantasy

The world already looks Scottish-mythic: standing stones on a ridge, a cairn on
the summit, an arch over a gully, long golden light. The natural pivot is not
swords-and-sorcery — it is **folklore**. Things that were always in these hills
and have started coming back down. Trolls in the gorges. Goblins in warrens
under the roots. Barrows that should have stayed shut.

That gives us a spine no amount of content can muddle:

> **The Strangeness Gradient.** The lowlands are mundane — deer, weather,
> hunger. The high country is dangerous. The deep places barely obey physics.
> Strangeness rises with distance, altitude and darkness.

Everything hangs off that one idea. It is a difficulty curve you can *see*, a
reason to explore, a way to add fantasy without throwing away the quiet beauty
of the opening hour, and it maps directly onto systems that already exist
(altitude, biome mask, time of day, weather).

---

## 2. Design pillars

The lines we do not cross. These exist to settle arguments later.

| Pillar | Meaning |
|---|---|
| **Patience is rewarded** | The stalk is the game. Anything that makes rushing optimal is wrong. |
| **The world is worth looking at** | No mechanic may make players stop noticing the light. Survival meters serve the mood, not the other way round. |
| **Everything is generated** | No asset pipeline, ever. Procedural geometry, procedural audio, seeded randomness. Tiny download, infinite variety, instant iteration. |
| **Systems over scripts** | Behaviour emerges from senses, weather and need. No quest markers, no cutscenes, no invisible walls. |
| **The world is honest** | If it looks like you could walk there, you can. If an animal seems to have noticed you, it has. |
| **Determinism is sacred** | Same seed, same world, forever. This is not a nicety — it is what makes multiplayer cheap (see below). |

### Explicit non-goals

Naming these now saves months later.

- **No asset store, no imported models.** The constraint is the aesthetic.
- **No MMO.** Target is 2–8 friends on a self-hosted box, not a persistent
  shard for hundreds.
- **No skill trees or XP bars.** Progress is knowledge, equipment and territory.
- **No quest log.** The monoliths on the ridge already tell you where to go.
- **No anti-cheat arms race.** Friends' servers. Authority prevents accidents,
  not adversaries.

---

## 3. The one big architectural bet

**Multiplayer must be prepared for early and shipped late.**

Retrofitting network authority onto a game built single-player is the classic
way these projects die. But building the netcode before there is a game is how
they stall. The resolution:

> Do the *architecture* for multiplayer in Phase 1, while there is almost
> nothing to migrate. Ship the *network layer* in Phase 5, when there is a game
> worth sharing.

Concretely, three properties get established early and then never broken:

1. **Simulation is separate from presentation.** One authoritative `World`
   object holds all state. Rendering only ever reads. (Already half-true — the
   codebase has a "rendering only reads" habit — but `main.js` currently wires
   everything together as globals.)
2. **All player action is an intent.** Nothing mutates world state directly.
   You submit "draw bow", "release", "pick up item 7" and the sim resolves it
   on a fixed tick. Single-player becomes *a server running in the same
   process*, and networking becomes a transport swap.
3. **The world is generated from a seed on every machine.** Terrain, trees,
   rocks, landmarks and loot sites are all pure functions of the seed already.
   **Clients never download terrain.** Only entities and events cross the wire
   — creatures, players, projectiles, built structures. That is a very small
   packet budget for a very large world, and it is a genuine advantage this
   codebase has that most do not.

This bet is the single most important thing in this document. It pays for
multiplayer **and** for LLM-driven minds (§6b), because both are, structurally,
just another source of intents on the same bus.

---

## 4. Two modes, defined as data

A `Ruleset` object, not a scatter of `if` statements. Modes become config rows,
exactly like creatures and items already are.

| | **Sandbox** (what exists today) | **Survival** (the real game) |
|---|---|---|
| Free-fly camera | yes | **no** |
| Spawn / teleport / weather commands | yes | no |
| Time scrubbing | yes | no — the sun moves at its own pace |
| Hunger, cold, wetness | off | **on** |
| Death | respawn, no cost | drop your pack where you fell |
| World persistence | none | saved, and it keeps running |
| Purpose | testing, screenshots, tuning | the game |

Sandbox stays forever. It is how the world gets built and tuned, and it is a
genuinely lovely thing to walk around in.

---

## 5. The survival web

The reason to add hunger and temperature is not realism — it is that they make
every system already built *load-bearing*.

```
        COLD  ←  altitude · night · wind · rain · wet clothing · immobility
          ↓
      countered by  →  fire · shelter · hide clothing · movement · hot springs

       HUNGER  ←  time · exertion · cold (you burn more when freezing)
          ↓
      countered by  →  hunting · cooking · foraging · preserved food
```

Look at what that makes matter, all of which already exists:

- **Altitude** — the terrain has it; now it has a snow line and a reason to fear
  the tops.
- **Wind** — drives scent for stalking; now it also drives wind chill.
- **Rain** — masks your noise and scent (a gift); now it also soaks you and
  kills you slowly.
- **Night** — beautiful; now it is also the coldest and most dangerous time.
- **Hides and venison** — currently loot with no purpose; now they are clothing
  and dinner.

One mechanic, five systems promoted from decoration to consequence. That is the
test every new survival mechanic must pass.

**Guard rail:** meters must be *slow*. Hunger measured in in-game days, not
minutes. The failure mode of survival games is a chore loop that interrupts the
thing you came for. If a player cannot stand still for two minutes and watch the
light change, the numbers are wrong.

---

## 6. The bestiary

The creature registry already treats species as data — hit points, senses,
speeds, behaviour, drop table, spawn rules. Everything below is a table row plus
occasionally one new behaviour class.

The design rule: **every creature must invert something.** The deer taught you
wind and patience. Each new one should make a lesson you learned wrong.

| Creature | Where | What it inverts |
|---|---|---|
| **Deer** ✅ | lowland, woodland edge | the baseline — wind and patience |
| **Bear** ✅ | deep woodland | you cannot outrun the first charge; stand and shoot |
| **Hare** | meadow, moor | too fast to stalk — you must lead the shot |
| **Boar** | woodland | does not flee, does not stalk: it *charges and leaves* |
| **Corvids** | anywhere, near kills | they follow your kills and **give your position away** — an alarm chain you caused |
| **Goblin** ✅ | high country, **night only** | hunts *you*, in packs, by scent. Cowardly alone: break the pack and it breaks. First enemy with **morale**. |
| **Troll** ✅ | gorges (`minSlope`), night | nearly blind, superb hearing — the exact reverse of the deer. You can watch it from open ground and it has no idea. Retreats at sunrise. |
| **Wisp** | bog, night, mist | no combat at all. It leads you somewhere. Pure dread. |
| **White Stag** | rare, dawn, mist | the thing the game is named for. Finding it is the reward; what you do then is a choice with weight. |
| **The thing in the deep places** | the Blight | unnamed, unstatted here on purpose |

### Systemic ideas worth building

- **Regional pressure.** Track how much you have hunted each area. Hunt it out
  and something *notices* — predators move in, prey thins, goblins investigate
  the carcasses. The world responds to you without a single scripted trigger.
- **Sunlight as a weapon.** Trolls retreat at dawn. Surviving until sunrise
  becomes a real tactic, and it makes the day/night cycle mechanical rather
  than scenic.
- **Weather as a summoner.** Certain things only walk in mist. A storm brings
  something down from the tops. The weather system already picks states — this
  is one hook away.

---

## 6b. Minds — LLM brains for some of the world

*Long-range. Depends on Phase 1, and wants Phase 5. Written down now because it
changes what Phase 1 should look like.*

The goal is **not** chatty NPCs. It is a handful of inhabitants who **remember,
decide and pursue** — and whose reasoning is grounded in what they can actually
perceive.

### The split that makes it work

An LLM call takes hundreds of milliseconds to seconds. That is fatal for
anything running at tick rate. So a mind is two layers, and they never mix:

| Layer | Runs at | Owns | Implementation |
|---|---|---|---|
| **Reflex** | every tick | seeing, hearing, smelling, fleeing, aiming, footwork | the awareness meter and state machines that already exist |
| **Deliberation** | every few seconds, or on a trigger | goals, disposition, memory, speech, grudges | the model |

> **The model never drives a body.** It sets intent — *hunt the ridge*, *follow
> that human*, *fall back to the warren*, *say this*. The existing state machine
> executes it. If the model is slow, absent or wrong, the creature still behaves
> like a competent animal.

### Why this is nearly free after Phase 1

Phase 1 turns all player action into **intents on a fixed tick**. An LLM agent
is then just *another intent producer*. Same bus, same validation, same tick.
Nothing about the game has to learn that a mind is involved.

That is the strongest argument for doing Phase 1 properly and early — it is the
substrate for both multiplayer and this.

### The honesty rule

> **A mind is given its creature's senses, not the world's state.**

The prompt is built from what that creature could actually perceive: what it can
see given its FOV and the light, what it heard, what the wind carried, what it
remembers. Never the player's coordinates, never inventory it has not seen.

This is the difference between an opponent that feels alive and one that feels
like it is cheating — and it is cheap here, because the sense model that
produces exactly this already exists.

### Where minds go

| Candidate | Why it earns the cost |
|---|---|
| **The rival hunter** | Another hunter working the same valley, under identical rules — same bow, same hunger, same wind. Competes for your deer, leaves tracks you can read, may help, trade, follow or rob you. The single best fit: no special-casing, and it doubles as a live multiplayer test harness. |
| **The goblin chief** | One mind per warband. The chief deliberates; the rest are cheap state machines carrying out orders. Remembers that you burned their warren, and acts on it a week later. |
| **The troll** | Slow, ancient, talks. One creature, rarely encountered, high value per call. Might be bargained with. |
| **The chronicler** | Not embodied. Names places, records what happened, and turns your run into a story you can read afterwards. |

### Constraints to hold

- **Fully playable with no model at all.** No key, no network, no problem — the
  scripted brains are the floor, not a fallback.
- **Bounded cost.** A handful of minds, on a slow cadence, with tight context.
  Never one per goblin.
- **Determinism survives.** Model output is not reproducible, so decisions are
  **written into the world's event log as intents**. A replay reads the log
  rather than re-asking the model, and stays exact.
- **Server-side only** in multiplayer. Clients never hold keys or call out.
- **Constrained output.** The model chooses among world-legal intents. It can
  want anything; it can only *do* what the rules permit.

---

## 7. Places worth finding

The terrain is currently a pure heightfield: beautiful, but it has no *insides*.
This phase is the biggest engine work in the plan.

| Feature | Notes |
|---|---|
| **Caves & goblin warrens** | Needs overlay geometry — a heightfield cannot express an overhang. Likely approach: hand-authored-ish procedural modules stitched into carved terrain mouths. |
| **Gorges & ravines** | The domain-warped noise can carve these already; they need traversal (rope bridges, fords) to be interesting. |
| **Barrows** | Burial mounds you can open. Consequences for doing so. |
| **Stone circles** | Already exist as landmarks. Give them a *function* at certain hours or weathers. |
| **Bogs & marsh** | Slow movement, hide things, wisps, a distinct palette. Cheap: a biome mask plus a movement modifier. |
| **Snow line** | Falls straight out of altitude + temperature. Free, and it makes the tops feel like the tops. |
| **Hot springs** | Warmth in the cold country. A survival oasis worth walking to. |
| **Waterfalls & rivers** | Flowing water down the terrain gradient. Also masks sound — another stealth interaction. |
| **The Blight** | A region where the palette, the sky and the rules shift. The far end of the strangeness gradient. |

**Named places.** Every seed should generate places with generated names, so
players can say "I found the Hollow at Rannoch" and mean something specific.
Cheap to build, enormous for how a shared world feels.

---

## 8. The phases

Sequential. Each ends with something playable. Rough sizes are relative, not
calendar promises.

### Phase 0 — Modes and persistence · *small*
**Goal:** a Survival run you can leave and come back to.
- `Ruleset` as data; Sandbox vs Survival.
- Survival disables fly, spawn commands, time scrubbing.
- Save/load. Cheap, because the world is seed-derived — a save is your state
  plus the *diffs* (what you killed, took, and later built).

**Done when:** you can start a Survival run, quit, reopen the tab, and the arrow
you left in a tree is still there.

---

### Phase 1 — The simulation core · *large, invisible*
**Goal:** the architecture bet, paid while it is still cheap.
- One authoritative `World`; presentation reads only.
- Player action becomes intents resolved on a fixed tick.
- The sim runs **headless in Node**, producing identical results to the browser.

**Done when:** `npm run sim -- --seed X --ticks 10000` runs with no renderer and
matches an in-browser run exactly.

> This phase has no player-visible payoff. Doing it anyway is the difference
> between multiplayer taking a month and taking a year.

---

### Phase 2 — The body · *medium*
**Goal:** hunger, cold, and the reasons to build a fire.
- Hunger, warmth, wetness, exhaustion — all slow.
- Fire (light, warmth, cooking, visible for miles at night — and to goblins).
- Clothing from hides. Cooking venison. Food spoilage.
- Temperature from altitude, time, wind chill, wetness.

**Done when:** you can die of exposure on a ridge at night, and know exactly
which three decisions would have saved you.

---

### Phase 3 — The world turns strange · *medium* — ✅ **shipped**
**Goal:** the fantasy pivot, and the first night that genuinely frightens you.
- ✅ Goblins with pack morale (`creatures/morale.js`); trolls with inverted senses.
- ✅ The strangeness gradient as a real field (`world/strangeness.js`), wired into spawning.
- ✅ Herd/pack alarm propagation — chained, generation-decayed, spacing-sensitive.
- ✅ Conditional encounters: `nightOnly`, `strangeness` bands, `minSlope` habitat,
  sunrise retreat.

**Done when:** a night in the high country is something you prepare for.

**Measured, in encounters rather than bodies** (one troll and one warband of five
are both "something you met"):

| where / when | deer | bear | goblin | troll |
|---|---|---|---|---|
| near the lake, noon | 88% | 13% | — | — |
| near the lake, midnight | 68% | 19% | 10% | 3% |
| high country, noon | 74% | 26% | — | — |
| **high country, midnight** | 27% | 16% | **41%** | **15%** |

Over half of what you meet on the tops after dark is something that hunts you,
and nothing strange exists anywhere in daylight. Population runs ~15 alive by
day and ~21 at night within the 320 m radius.

---

### Phase 4 — Places worth finding · *large* — ✅ **shipped**
**Goal:** the world gets insides.
- ✅ Caves (`world/caves.js`) — a heightfield bowl for collision plus a roof
  shell for the overhang, which is how you get a cave without an overhang.
  Doubles as the goblin warren.
- ✅ Bogs, gorges, snow line, hot springs (`world/regions.js`).
- ✅ Barrows and stone circles (`world/sites.js`) — a survey point and loot
  with a consequence.
- ✅ Procedural place names (`world/placenames.js`).

**Done when:** you can tell another player where to go and they can find it.

**Demonstrated:** told to meet at *Sunny Muir* → `findPlace` says "972 m north"
→ walk there → the place is called Sunny Muir. The whole infinite world is named
from the seed, so two players on a seed see identical names forever.

**The rule the phase ran on: a place must change a decision.** Measured:

| ground | air | exposure | speed | noise |
|---|---|---|---|---|
| open moor | 10.7 °C | 0.35 | 99% | 1.0× |
| gorge | 9.5 °C | 0.05 | 86% | 1.0× |
| bog | 8.9 °C | 0.23 | **52%** | **2.1×** |
| snow line | 1.3 °C | 0.92 | 78% | 1.5× |
| hot spring | 25.0 °C | 0.35 | 100% | 1.0× |
| **inside a cave** | **+1.9 °C at 04:00** | **0.02** | — | — |

Twenty-four degrees between the snow line and a hot spring; a bog is half speed
and twice as loud, so going round is often faster than going through. That is
the first time a *route* has been a decision in this game.

---

### Phase 5 — Two players · *large*
**Goal:** a friend on your LAN, in your world.
- Node server, WebSocket, authoritative tick.
- Clients generate terrain from the seed; only entities and events sync.
- Join, leave, reconnect. Interest management by distance.

**Done when:** two people stalk the same deer and only one of them gets it.

---

### Phase 6 — Together and against · *medium* — ✅ **shipped**
**Goal:** rules for company.
- ✅ Parties — no ceremony, no invite handshake; on a LAN that is friction.
- ✅ **PvE:** a pack counts *your* numbers as well as its own (`oddsWeight`).
- ✅ **PvP:** zoned by the **strangeness gradient**, not a toggle.
- ✅ Death drops what you carried where you fell — a problem with a location.

**Done when:** four players survive a warband raid, or fail to. — `npm run raidcheck`

Five goblins, deep night, against a party that grows:

| players | opposition | morale | nerve | committed | mean dist | health |
|---|---|---|---|---|---|---|
| 1 | 1 | 1.00 | emboldened | 5 | 1.2 m | 45 |
| 2 | 2 | 0.86 | emboldened | 5 | 1.3 m | 78, 34 |
| 3 | 1\* | 0.68 | confident | 5 | 1.2 m | 0, 100, 0 |
| **4** | 4 | 0.34 | **wavering** | 0 | 13.4 m | untouched |
| 6 | 6 | 0.15 | **routed** | 0 | 29.9 m | untouched |

\* *opposition falls to 1 because two of the three are already dead — the odds
swung back when the pack won. That is the mechanic reading the fight, not a bug.*

And the fight scales — the content knob is warband size, not creature stats:

| players | warband | nerve | health after 9 s |
|---|---|---|---|
| 4 | 5 | wavering | untouched |
| 4 | 8 | emboldened | 100, 45, 89, 100 |
| 4 | 16 | emboldened | 78, **0**, 89, 67 |

---

### Phase 7 — Leaving a mark · *large* — ✅ **shipped**
**Goal:** somewhere to come back to.
- ✅ Gather — the scatter already tagged every collider `tree` or `rock`, so
  harvesting needed no new world data at all.
- ✅ Craft and place (`world/structures.js`) — four buildables, one key.
- ✅ Storage, shelter, a solid palisade.
- ✅ Ownership recorded; persistence across restarts.

**Done when:** you can build a camp, log off, and find it still standing next
week — with your friend's additions to it. — `npm run campcheck`

Three in the morning, in a storm, on open moor:

| | exposure | wind | rain |
|---|---|---|---|
| open ground | 0.41 | 0.79 | 0.80 |
| **a camp** | **0.03** | **0.05** | **0.00** |

Structures are the **first thing in this world not derivable from the seed**.
Terrain, trees, caves, barrows, creatures and place names all regenerate for
free; a camp does not — which is precisely what makes it a mark rather than
scenery, and why it is the only thing written out in full.

---

---

### Phase 8 — Minds · *large, long-range*
**Goal:** a few inhabitants who remember and decide. See §6b.
- Deliberation layer on the intent bus, on a slow cadence.
- Perception-grounded prompting — a mind sees what its creature sees.
- Decisions logged as intents, so replays stay deterministic.
- The rival hunter first: identical rules to a player, and a live test for
  everything multiplayer will need.

**Done when:** you can track another hunter through the valley by their prints,
and they are not following a script.

---

### Later, deliberately deferred

Written down so they stop being distractions: mounts, farming, seasons, magic
systems, NPC settlements and trade, dedicated server hosting for strangers,
mod support, a soundtrack.

---

## 9. Open questions

Things I have a recommendation on but should not decide alone.

| Question | My recommendation |
|---|---|
| **How harsh is death in Survival?** | Drop your pack where you fell, keep what you wore. Recoverable, but a real walk of shame. Full loss is too cruel for a game about patience. |
| **Is PvP always on?** | No. Opt-in via a flag, or zoned to the strange country. Friends' servers should not default to betrayal. |
| **How large is the world?** | Effectively infinite already (terrain streams from noise). Recommend *bounding it* — a knowable region beats endless sameness, and it makes named places meaningful. |
| **Does magic exist for the player?** | Prefer not. Keep the player mundane; let the *world* be strange. That contrast is the whole feeling. |
| **First-person only?** | Yes. Third-person would mean character models, animation and a whole aesthetic this project has deliberately avoided. |
| **How many players?** | Design for 4. Make sure 8 works. Do not care about 30. |

---

## 10. What we do next

The honest recommendation for the immediate next step:

**Phase 0, then Phase 1.** They are unglamorous, and they are the two that
determine whether everything after them is possible. Phase 0 is small and
gives an immediate win (a Survival mode that persists). Phase 1 is the
architecture bet, and it gets cheaper the sooner it happens — every system
added before it is one more thing to migrate.

If that feels too dry to start with, an acceptable compromise is to do **Phase 0,
then a slice of Phase 3** (goblins, so the pivot feels real), **then Phase 1**.
The migration cost of one extra creature is small, and morale matters.

What should *not* happen is Phases 2, 3 and 4 all landing before Phase 1.
